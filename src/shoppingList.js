// Gestione lista della spesa, aggiunta/modifica articoli, importi e sconti
import { state } from "./state.js";
import { SVG_CHK, SVG_CIRCLED_PLUS, SVG_CIRCLE_X, SVG_FILTER_CLEAR, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, displayUnit, esc, eurosFromInput, filterBySearch, fitStoreChipLabels, fmtQtyUnit, money, moneyPerUnit, norm, now, parseQty, productDisplayParts, productSearchText, qtyValid, quantityStepValue, storeChipHtml, storeHasColors, uuid } from "./calculations.js";
import { activeItems, activeList, allCategoriesSorted, allProductsSorted, allStoresSorted, delOne, getAll, getOne, putOne, replaceItems, settings, snapshotItems, storeIdsForProduct, txDone, visibleListItems } from "./storage.js";
import { attachSearchClear, bindSwipeDelete, closeModal, confirmDialog, customDropdown, infoPop, modal, releaseModalKeyboard, selectAllOnFocus, showToast, showUndoToast, singleFilterHtml, swipeWrap, updateFloatingAddButton, updateScrollTopButton, updateSingleFilterUI, wireCustomDropdown, wireSingleFilter } from "./ui.js";
import { currentSavedListId, isSavedListModified, listItemsForSave, openSavedListsWindow, saveListAs } from "./history.js";
import { openArchiveCurrentListModal, openArchiveWindow } from "./archive.js";
import { openProductForm } from "./products.js";
import { render } from "./router.js";

export async function removeItemWithUndo(id) {
  const item = await getOne("shoppingListItems", id);
  if (!item) return;
  await delOne("shoppingListItems", id);
  state.celebrationShownFor = "";
  await renderList();
  showUndoToast("Articolo rimosso dalla lista", async () => {
    await putOne("shoppingListItems", item);
    await renderList();
  });
}

export function wireAmount(p, prices) {
  const upd = () => {
    const q = parseQty($("#quickQty").value), sid = $("#quickStore").value || null, pr = prices.find((x) => x.productId === p.id && x.storeId === sid), el = $("#quickAmount");
    if (!el) return;
    const isFreeOffer = !!$("#manualFreeOffer")?.checked;
    const manVal = $("#manualPriceInput")?.value.trim() ?? "";
    const manUnitMinor = eurosFromInput(manVal);
    const listInp = $("#listPriceInput");
    const listUnitMinor = sid && listInp && !listInp.disabled ? eurosFromInput(listInp.value.trim()) : null;
    let totalCents = null;
    if (isFreeOffer) {
      totalCents = 0;
    } else if (manUnitMinor !== null && !Number.isNaN(manUnitMinor) && manUnitMinor > 0 && q > 0) {
      totalCents = Math.round(manUnitMinor * q);
    } else if (sid && listUnitMinor !== null && !Number.isNaN(listUnitMinor) && q > 0) {
      totalCents = Math.round(listUnitMinor * q);
    } else if (!listInp && pr && q > 0) {
      totalCents = Math.round(pr.amountMinor * q);
    }
    el.innerHTML = `<span class="assign-total-lbl">IMPORTO CALCOLATO</span><strong class="assign-total-val">${totalCents !== null ? (totalCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC" : "N/D"}</strong>`;
  };
  const qtyInp = $("#quickQty");
  qtyInp.addEventListener("input", upd);
  qtyInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      upd();
      qtyInp.blur();
      releaseModalKeyboard();
    }
  });
  $("#qtyPlus").addEventListener("click", () => setTimeout(upd, 0));
  $("#qtyMinus").addEventListener("click", () => setTimeout(upd, 0));
  $("#quickStore").addEventListener("change", upd);
  $("#listPriceInput")?.addEventListener("input", upd);
  $("#manualPriceInput")?.addEventListener("input", upd);
  $("#manualFreeOffer")?.addEventListener("change", upd);
  selectAllOnFocus(qtyInp);
  upd();
}

export function wireManualAmount(initialVal = "", initialFreeOffer = false) {
  const inp = $("#manualPriceInput");
  if (!inp) return;
  const box = inp.closest(".name-box");
  const manualRow = $("#quickManualBox");
  const freeCb = $("#manualFreeOffer");
  const clearBtn = $("#manualPriceClear");
  const noBtn = $("#manualPriceNo");
  const okBtn = $("#manualPriceOk");

  const hasPositiveVal = (v) => {
    if (!v) return false;
    const c = eurosFromInput(v);
    return c !== null && !Number.isNaN(c) && c > 0;
  };

  let savedVal = hasPositiveVal(initialVal) ? initialVal.trim() : "";
  if (savedVal) {
    const c = eurosFromInput(savedVal);
    if (c !== null && !Number.isNaN(c) && c > 0) {
      savedVal = (c / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      inp.value = savedVal;
    }
  } else {
    inp.value = "";
  }

  const updateYellow = () => {
    const isPos = !inp.disabled && hasPositiveVal(inp.value);
    inp.classList.toggle("has-positive", isPos);
    box?.classList.toggle("has-positive", isPos);
  };

  const syncState = (isEditing) => {
    if (!box) return;
    const editing = !inp.disabled && !!isEditing;
    box.classList.toggle("editing", editing);
    const showClear = !inp.disabled && !editing && hasPositiveVal(inp.value);
    box.classList.toggle("has-clear", showClear);
    if (clearBtn) clearBtn.hidden = !showClear;
    updateYellow();
  };

  const syncFreeOfferState = () => {
    const isFree = !!freeCb?.checked;
    inp.disabled = isFree;
    inp.readOnly = isFree;
    inp.tabIndex = isFree ? -1 : 0;
    inp.setAttribute("aria-disabled", isFree ? "true" : "false");
    if (isFree) {
      inp.setAttribute("disabled", "");
      inp.setAttribute("readonly", "");
    } else {
      inp.removeAttribute("disabled");
      inp.removeAttribute("readonly");
    }
    manualRow?.classList.toggle("is-free-disabled", isFree);
    if (manualRow) manualRow.inert = isFree;
    if (isFree) {
      if (document.activeElement === inp) {
        inp.blur();
        releaseModalKeyboard();
      }
      try { window.getSelection()?.removeAllRanges?.(); } catch (_) {}
      syncState(false);
    } else {
      syncState(false);
    }
  };

  if (freeCb) {
    freeCb.checked = !!initialFreeOffer;
    freeCb.addEventListener("change", syncFreeOfferState);
  }
  syncFreeOfferState();

  const blockIfDisabled = (e) => {
    if (inp.disabled || freeCb?.checked) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      inp.blur();
    }
  };
  const startEdit = (e) => {
    if (inp.disabled || freeCb?.checked) {
      if (e?.cancelable) e.preventDefault();
      inp.blur();
      return;
    }
    if (!box || box.classList.contains("editing")) return;
    syncState(true);
  };

  inp.addEventListener("pointerdown", blockIfDisabled);
  inp.addEventListener("mousedown", blockIfDisabled);
  inp.addEventListener("touchstart", blockIfDisabled, { passive: false });
  inp.addEventListener("focus", startEdit);
  inp.addEventListener("click", startEdit);
  selectAllOnFocus(inp);
  inp.addEventListener("input", () => {
    if (inp.disabled || freeCb?.checked) return;
    updateYellow();
  });

  clearBtn?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  clearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inp.disabled) return;
    savedVal = "";
    inp.value = "";
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
  });

  const commit = () => {
    const val = inp.value.trim();
    if (!val) {
      savedVal = "";
      inp.value = "";
      syncState(false);
      inp.dispatchEvent(new Event("input"));
      inp.blur();
      releaseModalKeyboard();
      return;
    }
    const cents = eurosFromInput(val);
    if (Number.isNaN(cents)) {
      showToast("Importo non valido.");
      return;
    }
    if (cents <= 0) {
      savedVal = "";
      inp.value = "";
    } else {
      savedVal = (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      inp.value = savedVal;
    }
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
    releaseModalKeyboard();
  };

  const cancel = () => {
    if (hasPositiveVal(savedVal)) {
      inp.value = savedVal;
    } else {
      savedVal = "";
      inp.value = "";
    }
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
    releaseModalKeyboard();
  };

  noBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  noBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    cancel();
  });
  okBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  okBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    commit();
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  inp.addEventListener("blur", () => {
    if (box && box.classList.contains("editing")) {
      cancel();
    }
  });
}

export function wireProductNameEdit(p) {
  const inp = $("#quickProductName");
  if (!inp) return { saveName: async () => true };
  const box = inp.closest(".name-box");
  let savedName = p.name;
  const showIcons = () => box?.classList.add("dirty");
  inp.addEventListener("focus", showIcons);
  inp.addEventListener("click", showIcons);
  inp.addEventListener("input", showIcons);
  $("#quickProductNameNo")?.addEventListener("click", () => {
    inp.value = savedName;
    box?.classList.remove("dirty");
    inp.blur();
  });
  inp.addEventListener("blur", () => {
    if (inp.value.trim() === savedName) box?.classList.remove("dirty");
  });
  const saveName = async () => {
    const val = inp.value.trim();
    if (!val) {
      showToast("Inserisci il nome dell'articolo.");
      inp.focus();
      return false;
    }
    if (val !== savedName) {
      const allP = await getAll("products");
      const normVal = norm(val);
      if (allP.some((x) => x.id !== p.id && x.nameNormalized === normVal)) {
        showToast("Articolo gi\xE0 presente.");
        inp.focus();
        return false;
      }
      p.name = val;
      p.nameNormalized = normVal;
      p.updatedAt = now();
      await putOne("products", p);
      savedName = val;
      showToast("Nome articolo aggiornato");
    }
    box?.classList.remove("dirty");
    inp.blur();
    return true;
  };
  $("#quickProductNameOk")?.addEventListener("click", saveName);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveName();
    }
  });
  return { saveName };
}

export function wireListPrice(p, prices) {
  const inp = $("#listPriceInput");
  const box = inp?.closest(".name-box");
  const clearBtn = $("#listPriceClear");
  const noBtn = $("#listPriceNo");
  const okBtn = $("#listPriceOk");
  const storeEl = $("#quickStore");
  const editedPrices = new Map();
  if (!inp || !storeEl) return { editedPrices };

  const dbPriceFor = (sid) => {
    if (!sid) return null;
    const pr = prices.find((x) => x.productId === p.id && x.storeId === sid);
    return pr ? pr.amountMinor : null;
  };
  const fmtMinor = (minor) => minor !== null && minor !== undefined
    ? (minor / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
    : "";
  const hasValidVal = (v) => {
    if (!v || !String(v).trim()) return false;
    const c = eurosFromInput(v);
    return c !== null && !Number.isNaN(c);
  };
  const updateStoreOptionPrice = (sid, minor) => {
    if (!sid) return;
    const opt = [...document.querySelectorAll('#quickStoreMenu [data-dropdown-id="quickStore"]')].find((el) => el.dataset.value === sid);
    if (!opt) return;
    let priceEl = opt.querySelector(".dd-opt-price");
    if (minor !== null && minor !== undefined) {
      const txt = moneyPerUnit(minor, p);
      if (!priceEl) {
        priceEl = document.createElement("span");
        priceEl.className = "dd-opt-price";
        opt.appendChild(priceEl);
      }
      priceEl.textContent = txt;
    } else if (priceEl) {
      priceEl.remove();
    }
  };

  let currentSid = storeEl.value || null;
  let savedVal = inp.value.trim();

  const syncState = (isEditing) => {
    if (!box) return;
    const enabled = !!currentSid;
    inp.disabled = !enabled;
    inp.placeholder = enabled ? "0,00" : "N/D";
    box.classList.toggle("is-disabled", !enabled);
    box.classList.toggle("editing", enabled && !!isEditing);
    const showClear = !!clearBtn && enabled && !isEditing && hasValidVal(inp.value);
    box.classList.toggle("has-clear", showClear);
    if (clearBtn) clearBtn.hidden = !showClear;
  };

  const loadForStore = (sid) => {
    currentSid = sid || null;
    if (!currentSid) {
      savedVal = "";
      inp.value = "";
      syncState(false);
      return;
    }
    const minor = editedPrices.has(currentSid) ? editedPrices.get(currentSid) : dbPriceFor(currentSid);
    savedVal = fmtMinor(minor);
    inp.value = savedVal;
    syncState(false);
  };

  loadForStore(currentSid);

  const startEdit = () => {
    if (!currentSid || !box || box.classList.contains("editing")) return;
    syncState(true);
  };

  inp.addEventListener("focus", startEdit);
  inp.addEventListener("click", startEdit);
  selectAllOnFocus(inp);

  box?.closest(".manual-input-wrap")?.addEventListener("click", () => {
    if (!currentSid) showToast("Seleziona prima un supermercato.");
  });

  inp.addEventListener("input", () => {
    if (!currentSid) return;
    const val = inp.value.trim();
    if (!val) {
      editedPrices.set(currentSid, null);
      updateStoreOptionPrice(currentSid, null);
      return;
    }
    const cents = eurosFromInput(val);
    if (cents !== null && !Number.isNaN(cents)) {
      editedPrices.set(currentSid, cents);
      updateStoreOptionPrice(currentSid, cents);
    }
  });

  clearBtn?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  clearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentSid) return;
    savedVal = "";
    inp.value = "";
    editedPrices.set(currentSid, null);
    updateStoreOptionPrice(currentSid, null);
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
  });

  const commit = (fromBlur = false) => {
    if (!currentSid) return true;
    const val = inp.value.trim();
    if (!val) {
      savedVal = "";
      inp.value = "";
      editedPrices.set(currentSid, null);
      updateStoreOptionPrice(currentSid, null);
      syncState(false);
      inp.dispatchEvent(new Event("input"));
      if (!fromBlur) {
        inp.blur();
        releaseModalKeyboard();
      }
      return true;
    }
    const cents = eurosFromInput(val);
    if (Number.isNaN(cents)) {
      if (!fromBlur) showToast("Controlla il prezzo di listino inserito.");
      else syncState(false);
      return false;
    }
    savedVal = fmtMinor(cents);
    inp.value = savedVal;
    editedPrices.set(currentSid, cents);
    updateStoreOptionPrice(currentSid, cents);
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    if (!fromBlur) {
      inp.blur();
      releaseModalKeyboard();
    }
    return true;
  };

  const cancel = () => {
    if (!currentSid) return;
    if (hasValidVal(savedVal)) {
      inp.value = savedVal;
      const cents = eurosFromInput(savedVal);
      editedPrices.set(currentSid, cents);
      updateStoreOptionPrice(currentSid, cents);
    } else {
      savedVal = "";
      inp.value = "";
      editedPrices.set(currentSid, null);
      updateStoreOptionPrice(currentSid, null);
    }
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
    releaseModalKeyboard();
  };

  noBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  noBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    cancel();
  });
  okBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  okBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    commit(false);
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      commit(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  inp.addEventListener("blur", () => {
    if (box && box.classList.contains("editing")) {
      commit(true);
    }
  });

  storeEl.addEventListener("change", (e) => {
    loadForStore(e.target.value || null);
  });

  return { editedPrices };
}

export async function saveEditedListPrices(productId, editedPrices) {
  if (!editedPrices || !editedPrices.size) return;
  const [existingPrices, existingStores] = await Promise.all([getAll("productPrices"), getAll("productStores")]);
  const prodPrices = existingPrices.filter((x) => x.productId === productId);
  const prodStores = existingStores.filter((x) => x.productId === productId);
  const toPutPrices = [], toDelPriceIds = [], toPutStores = [];
  for (const [storeId, amountMinor] of editedPrices.entries()) {
    if (!storeId) continue;
    const curPr = prodPrices.find((x) => x.storeId === storeId);
    const curVal = curPr ? curPr.amountMinor : null;
    if (amountMinor === curVal) continue;
    if (amountMinor === null) {
      if (curPr) toDelPriceIds.push(curPr.id);
    } else {
      toPutPrices.push({ id: curPr ? curPr.id : uuid(), productId, storeId, amountMinor, currency: "EUR", updatedAt: now() });
      if (!prodStores.some((x) => x.storeId === storeId)) {
        toPutStores.push({ id: uuid(), productId, storeId, createdAt: now() });
      }
    }
  }
  if (!toPutPrices.length && !toDelPriceIds.length && !toPutStores.length) return;
  const tx = state.db.transaction(["productPrices", "productStores"], "readwrite");
  const pp = tx.objectStore("productPrices"), ps = tx.objectStore("productStores");
  for (const id of toDelPriceIds) pp.delete(id);
  for (const rec of toPutPrices) pp.put(rec);
  for (const rec of toPutStores) ps.put(rec);
  await txDone(tx);
}

export async function clearOrReset(reset) {
  const prev = await snapshotItems();
  if (!prev.length) {
    showToast("La lista \xE8 vuota.");
    return;
  }
  const vis = new Set((await visibleListItems()).map((i) => i.id));
  if (!vis.size) {
    showToast("Nessun articolo nella visualizzazione corrente.");
    return;
  }
  const yes = await confirmDialog(
    reset ? "Inizializza spesa" : "Svuota Lista spesa",
    reset ? "Tutti gli articoli della spesa corrente verranno deflaggati. Procedere comunque?" : "Tutti gli articoli della spesa corrente verranno rimossi dalla lista. Procedere comunque?",
    reset ? "Inizializza" : "Svuota",
    { closeButton: false, backdropClose: false, cancelFirst: reset, confirmClass: reset ? "btn-primary" : "btn-danger" }
  );
  if (!yes) return;
  await replaceItems(reset ? prev.map((i) => vis.has(i.id) ? { ...i, checked: false, updatedAt: now() } : i) : prev.filter((i) => !vis.has(i.id)));
  showUndoToast(reset ? "Spesa inizializzata" : "Lista svuotata", () => replaceItems(prev));
}

export function openListMenu() {
  const icons = {
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.8A1.8 1.8 0 0 1 5.3 3H16.8L20.5 6.7V19.2A1.8 1.8 0 0 1 18.7 21H5.3A1.8 1.8 0 0 1 3.5 19.2Z" fill="#159447" stroke="#0c5c2e" stroke-width="1.15" stroke-linejoin="round"/><rect x="6.5" y="3" width="9" height="5.5" rx=".9" fill="#e6f6ec" stroke="#0c5c2e" stroke-width=".9"/><rect x="12.5" y="4" width="2" height="3.5" fill="#159447"/><rect x="5.8" y="11.5" width="12.4" height="9.5" rx="1.1" fill="#ffffff" stroke="#0c5c2e" stroke-width=".9"/><path d="M8 14.5h8M8 17.5h5.5" stroke="#159447" stroke-width="1.4" stroke-linecap="round"/></svg>',
    saveas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H16.5L20 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 19Z" fill="#2f6db5" stroke="#173f73" stroke-width="1.1" stroke-linejoin="round"/><rect x="6.2" y="3" width="8.6" height="5.2" rx=".8" fill="#dfe8f3" stroke="#173f73" stroke-width=".85"/><rect x="12" y="4" width="1.8" height="3.2" fill="#6b7f95"/><rect x="5.3" y="11.8" width="12.4" height="8.7" rx="1" fill="#ffffff" stroke="#173f73" stroke-width=".85"/><path d="M13 19.5l.8-3 4.8-4.8 2.2 2.2-4.8 4.8z" fill="#f5a623" stroke="#8a4b00" stroke-width=".9" stroke-linejoin="round"/><path d="M13 19.5l.8-3 2.2 2.2z" fill="#ffe0a6"/></svg>',
    load: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6A1.5 1.5 0 0 1 4 4.5h4.8l1.8 2.2h8.9A1.5 1.5 0 0 1 21 8.2v2.3H5.5L2.5 19Z" fill="#e0a21b" stroke="#8a5d00" stroke-width="1.1" stroke-linejoin="round"/><rect x="6.5" y="5.5" width="11" height="6.5" rx=".9" fill="#ffffff" stroke="#8a5d00" stroke-width=".85"/><path d="M8.5 8h7M8.5 10.2h5" stroke="#174f86" stroke-width="1.2" stroke-linecap="round"/><path d="M5.6 10.5H22l-3.4 9H2.5Z" fill="#ffd24d" stroke="#8a5d00" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    archiveCurrent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21V3Z" fill="#ffffff" stroke="#117a4b" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 8h7M8.5 11.8h5.5M8.5 15.6h3.5" stroke="#117a4b" stroke-width="1.55" stroke-linecap="round"/><circle cx="17.2" cy="16.2" r="3.6" fill="#159447" stroke="#ffffff" stroke-width="1.1"/><path d="M17.2 14.5v3.4M15.5 16.2h3.4" fill="none" stroke="#ffffff" stroke-width="1.55" stroke-linecap="round"/></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21V3Z" fill="#ffffff" stroke="#174f86" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 8h7M8.5 11.8h7M8.5 15.6h4.2" stroke="#174f86" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.2" cy="16.2" r="3.2" fill="#159447" stroke="#ffffff" stroke-width="1.1"/><path d="M15.9 16.2l.9.9 1.8-1.9" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const card = (key, title, desc, danger = false) => `<button type="button" class="list-action-card${danger ? " is-danger" : ""}" data-list-action="${key}"><span class="list-action-icon ${key}">${icons[key]}</span><span class="list-action-text"><span class="list-action-title">${title}</span><span class="list-action-desc">${desc}</span></span></button>`;
  const body = `<div class="list-menu-sheet">
    <div class="list-menu-group-label">Gestione liste</div>
    ${card("save", "Salva", "Salva la lista attuale.")}
    ${card("saveas", "Salva con nome", "Salva la lista attuale con un nuovo nome.")}
    ${card("load", "Elenco liste salvate", "Carica una lista dall\u2019elenco, sostituendo la lista attuale.")}
    <div class="list-menu-group-label is-second">Gestione spese</div>
    ${card("archiveCurrent", "Archivia spesa corrente", "Archivia la spesa attuale come scontrino.")}
    ${card("archive", "Archivio spese", "Consulta e gestisci gli scontrini archiviati.")}
  </div>`;
  modal("Lista della spesa", body, [], { closeButton: true, alignTop: true, backdropClose: false, themed: true });
  $("#modalRoot").querySelectorAll("[data-list-action]").forEach((btn) => btn.addEventListener("click", async () => {
    const m = btn.dataset.listAction;
    if (m === "save") {
      const id = await currentSavedListId();
      if (id) {
        closeModal(false);
        if (!(await listItemsForSave()).length) {
          showToast("La lista \xE8 vuota.");
          return;
        }
        const curSaved = await getOne("savedLists", id);
        await saveListAs(curSaved.name, curSaved);
        await renderList();
        showToast("Lista salvata");
      } else {
        state.currentModal = null;
        await openSavedListsWindow("save");
      }
    } else if (m === "saveas") {
      state.currentModal = null;
      await openSavedListsWindow("save");
    } else if (m === "load") {
      state.currentModal = null;
      await openSavedListsWindow("load");
    } else if (m === "archiveCurrent") {
      state.currentModal = null;
      await openArchiveCurrentListModal();
    } else if (m === "archive") {
      state.currentModal = null;
      await openArchiveWindow();
    }
  }));
}

export async function renderList() {
  const prevPageScroll = state.restoreListScroll ? state.listScrollY : window.scrollY;
  state.restoreListScroll = false;
  const _cid = await currentSavedListId(), _cl = _cid ? await getOne("savedLists", _cid) : null;
  const main = $("#appMain"), [items, products, cats, st, storeList, savedLists] = await Promise.all([activeItems(), getAll("products"), allCategoriesSorted(), settings(), allStoresSorted(), getAll("savedLists")]);
  const pMap = Object.fromEntries(products.map((p) => [p.id, p])), cMap = Object.fromEntries(cats.map((c) => [c.id, c])), sMap = Object.fromEntries(storeList.map((s) => [s.id, s]));
  const validItems = items.filter((it) => !!pMap[it.productId]);
  if (state.selectedStore === "none") state.selectedStore = "__none__";
  if (typeof state.selectedStore !== "string" || (state.selectedStore !== "all" && state.selectedStore !== "__none__" && !sMap[state.selectedStore])) {
    state.selectedStore = "all";
  }
  if (state.selectedCategory === "none") state.selectedCategory = "__none__";
  if (typeof state.selectedCategory !== "string" || (state.selectedCategory !== "all" && state.selectedCategory !== "__none__" && !cMap[state.selectedCategory])) {
    state.selectedCategory = "all";
  }
  state.selectedStores = state.selectedStore === "all" ? ["all"] : [state.selectedStore === "__none__" ? "none" : state.selectedStore];
  const storeVal = state.selectedStore, catVal = state.selectedCategory;
  const itemStoreKey = (it) => (it.storeId && sMap[it.storeId] ? it.storeId : "__none__");
  const itemCatKey = (it) => {
    const p = pMap[it.productId];
    return p?.categoryId && cMap[p.categoryId] ? p.categoryId : "__none__";
  };
  const matchesStore = (it, sid) => sid === "all" || itemStoreKey(it) === sid;
  const matchesCat = (it, cid) => cid === "all" || itemCatKey(it) === cid;
  const storeOpts = [{ id: "__none__", label: "Senza supermercato", html: '<span style="font-style:italic">Senza supermercato</span>' }]
    .concat(storeList.map((sto) => ({ id: sto.id, label: sto.name, html: storeHasColors(sto) ? storeChipHtml(sto) : "" })))
    .map((o) => ({
      ...o,
      disabled: o.id !== storeVal && !validItems.some((it) => itemStoreKey(it) === o.id && matchesCat(it, catVal))
    }));
  const catOpts = [{ id: "__none__", label: "Senza reparto", html: '<span style="font-style:italic">Senza reparto</span>' }]
    .concat(cats.map((c) => ({ id: c.id, label: c.name })))
    .map((o) => ({
      ...o,
      disabled: o.id !== catVal && !validItems.some((it) => matchesStore(it, storeVal) && itemCatKey(it) === o.id)
    }));
  const showAllStores = storeVal === "all";
  const showAllCats = catVal === "all";
  const allStoresDisabled = storeOpts.every((o) => o.disabled);
  const allCatsDisabled = catOpts.every((o) => o.disabled);
  const visible = validItems.filter((i) => matchesStore(i, storeVal) && matchesCat(i, catVal));
  const routes = await getAll("storeCategoryRoutes");
  const routePosition = (storeId, catId) => routes.find((r) => r.storeId === storeId && r.categoryId === catId)?.position ?? 99999;
  visible.sort((a, b) => {
    const pa = pMap[a.productId], pb = pMap[b.productId];
    if (!pa || !pb) return 0;
    if (showAllStores) {
      const sa = sMap[a.storeId]?.name || "Senza supermercato", sb = sMap[b.storeId]?.name || "Senza supermercato";
      const cmp = sa.localeCompare(sb, "it");
      if (cmp) return cmp;
      if (a.storeId && b.storeId) {
        const d = routePosition(a.storeId, pa.categoryId) - routePosition(b.storeId, pb.categoryId);
        if (d) return d;
      }
    } else if (storeVal !== "__none__") {
      const d = routePosition(storeVal, pa.categoryId) - routePosition(storeVal, pb.categoryId);
      if (d) return d;
    }
    return (cMap[pa.categoryId]?.name || "").localeCompare(cMap[pb.categoryId]?.name || "", "it", { sensitivity: "base" }) || pa.name.localeCompare(pb.name, "it", { sensitivity: "base" });
  });
  const prices = await getAll("productPrices");
  let knownCents = 0, purchasedCents = 0, missing = 0, checked = 0;
  for (const i of visible) {
    if (i.checked) checked++;
    const pr = prices.find((x) => x.productId === i.productId && x.storeId === i.storeId);
    const hasManual = (i.manualUnitPriceMinor !== undefined && i.manualUnitPriceMinor !== null) || (i.manualAmountMinor !== undefined && i.manualAmountMinor !== null);
    if (!hasManual && (!i.storeId || !pr)) {
      missing++;
      continue;
    }
    const cents = i.manualUnitPriceMinor !== undefined && i.manualUnitPriceMinor !== null
      ? Math.round(i.manualUnitPriceMinor * i.quantity)
      : (i.manualAmountMinor !== undefined && i.manualAmountMinor !== null ? i.manualAmountMinor : Math.round(pr.amountMinor * i.quantity));
    knownCents += cents;
    if (i.checked) purchasedCents += cents;
  }
  $("#totalValue").textContent = (knownCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
  $("#purchasedTotal").textContent = (purchasedCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("#missingPrices").textContent = missing ? `${missing} ${missing === 1 ? "prezzo" : "prezzi"} N/D` : "";
  $("#listCounter").textContent = `${checked}/${visible.length}`;
  $("#listFooter").style.setProperty("--p", (visible.length ? Math.round(checked / visible.length * 100) : 0) + "%");
  $("#listFooter").classList.toggle("is-complete", visible.length > 0 && checked === visible.length);
  const listFilterActive = (!allStoresDisabled && !showAllStores) || (!allCatsDisabled && !showAllCats);
  const isListModified = isSavedListModified(_cl, items, pMap, sMap);
  const canResetList = visible.length > 0 && checked > 0;
  const canEmptyList = visible.length > 0;
  const resetListIconSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#2f6db5" stroke="#173f73" stroke-width="1"/><path d="M7.2 7.2v3.9h3.9" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.1 14.3a5.2 5.2 0 1 0 1.3-5.7l-2.2 2.2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const emptyListLabel = savedLists.length ? "Nessuna lista caricata" : "Nessuna lista salvata";
  let html = `<div class="toolbar list-toolbar"><div class="list-title-stack"><div class="title-row"><h1>La mia Lista</h1>${infoBtn}</div><div class="list-inuse-wrap"><div class="list-inuse-left"><span class="list-inuse-badge${_cl ? "" : " is-empty"}">${_cl ? esc(_cl.name) : emptyListLabel}</span>${_cl && isListModified ? '<span class="list-modified-badge" title="Modifiche non ancora salvate" aria-label="Modifiche non ancora salvate"><span class="list-modified-dot" aria-hidden="true"></span>modificata</span>' : ""}</div></div></div><button type="button" class="kebab-menu-btn" id="clearListBtn" aria-label="Menu della lista" title="Menu della lista"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="2.1" fill="currentColor"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/><circle cx="12" cy="18.5" r="2.1" fill="currentColor"/></svg></button></div>
  ${infoPop("Componi la tua lista, aggiungendo articoli e assegnando loro le quantit\xE0 e il supermercato dove si acquister\xE0 (qualora questo non venisse specificato, verr\xE0 abbinato il supermercato predefinito).<br>Gli articoli verranno ordinati per supermercato e secondo il relativo percorso di spesa.")}<div class="sticky-action-wrap list-sticky-btn-wrap list-primary-action-row"><button class="btn btn-primary btn-block" id="addItemBtn">${SVG_CIRCLED_PLUS}<span>Aggiungi articolo alla lista</span></button><div class="list-quick-actions"><button type="button" class="header-icon list-quick-icon${canResetList ? "" : " dim"}" id="resetListQuickBtn" ${canResetList ? "" : "disabled"} aria-label="Inizializza spesa" title="Inizializza spesa">${resetListIconSvg}</button><button type="button" class="header-icon list-quick-icon trash-mini${canEmptyList ? "" : " dim"}" id="emptyListQuickBtn" ${canEmptyList ? "" : "disabled"} aria-label="Svuota Lista spesa" title="Svuota Lista spesa">${TRASH_OFFICE}</button></div></div>
  <div class="prod-filters-box prod-filters-split list-filters-box"><div class="prod-filters-head"><span class="prod-filters-title">Filtra per</span><button type="button" class="filter-clear${listFilterActive ? "" : " dim"}" id="resetListFilters" ${listFilterActive ? "" : "disabled"} aria-label="Azzera tutti i filtri" title="Azzera tutti i filtri">${SVG_FILTER_CLEAR}</button></div><div class="prod-filters-grid">${singleFilterHtml({ id: "listStoreFilter", allLabel: "Tutti i supermercati", options: storeOpts, selectedValue: storeVal, allDisabled: allStoresDisabled, searchMaxLength: 20, searchUppercase: true })}${singleFilterHtml({ id: "listCatFilter", allLabel: "Tutti i reparti", options: catOpts, selectedValue: catVal, allDisabled: allCatsDisabled, searchMaxLength: 25, searchUppercase: true })}</div></div>`;
  if (!visible.length) html += `<div class="empty" style="margin-top:14px">${items.length ? "Nessun articolo per questo filtro." : "La lista \xE8 vuota.<br>Inizia aggiungendo un articolo."}</div>`;
  else {
    const storeTotals = new Map();
    for (const item of visible) {
      if (!pMap[item.productId]) continue;
      const sto = sMap[item.storeId];
      const sk = sto?.id || "none";
      let stStat = storeTotals.get(sk);
      if (!stStat) {
        stStat = { count: 0, checked: 0, cents: 0, known: 0 };
        storeTotals.set(sk, stStat);
      }
      stStat.count++;
      if (item.checked) stStat.checked++;
      const pr = prices.find((x) => x.productId === item.productId && x.storeId === item.storeId);
      const hasManual = (item.manualUnitPriceMinor !== undefined && item.manualUnitPriceMinor !== null) || (item.manualAmountMinor !== undefined && item.manualAmountMinor !== null);
      if (hasManual || (item.storeId && pr)) {
        const cents = item.manualUnitPriceMinor !== undefined && item.manualUnitPriceMinor !== null
          ? Math.round(item.manualUnitPriceMinor * item.quantity)
          : (item.manualAmountMinor !== undefined && item.manualAmountMinor !== null ? item.manualAmountMinor : Math.round(pr.amountMinor * item.quantity));
        stStat.cents += cents;
        stStat.known++;
      }
    }
    let lastStore = "";
    for (const item of visible) {
      const p = pMap[item.productId];
      if (!p) continue;
      const catLabel = cMap[p.categoryId]?.name || "Senza reparto";
      const sto = sMap[item.storeId];
      const storeKey = sto?.id || "none";
      if (storeKey !== lastStore) {
        const isFirst = lastStore === "";
        if (!isFirst) html += "</div>";
        const storePart = sto ? storeChipHtml(sto, { className: "store-chip-heading" }) : '<span class="it">SENZA SUPERMERCATO</span>';
        const stStat = storeTotals.get(storeKey);
        const metaParts = [`${stStat.count} ${stStat.count === 1 ? "articolo" : "articoli"}`];
        if (stStat.known > 0) metaParts.push(money(stStat.cents));
        html += `<div class="list-store-group${isFirst ? " is-first" : ""}"><div class="category-heading store-list-heading${isFirst ? " is-first" : ""}"><span>${storePart}</span><span class="store-heading-meta">${metaParts.join(" \xB7 ")}</span></div>`;
        lastStore = storeKey;
      }
      const price = prices.find((x) => x.productId === item.productId && x.storeId === item.storeId);
      const hasManual = (item.manualUnitPriceMinor !== undefined && item.manualUnitPriceMinor !== null) || (item.manualAmountMinor !== undefined && item.manualAmountMinor !== null);
      const itemTotalCents = item.manualUnitPriceMinor !== undefined && item.manualUnitPriceMinor !== null
        ? Math.round(item.manualUnitPriceMinor * item.quantity)
        : item.manualAmountMinor;
      const hasPrice = hasManual || (!!item.storeId && !!price);
      const priceText = hasManual ? money(itemTotalCents) : (price ? money(Math.round(price.amountMinor * item.quantity)) : "prezzo N/D");
      const qtyText = `${fmtQtyUnit(item.quantity, p.unit)} ${esc(displayUnit(p))}`;
      const catHtml = p.categoryId && cMap[p.categoryId] ? esc(catLabel) : `<span class="it">${esc(catLabel)}</span>`;
      const dp = productDisplayParts(p);
      const brandRow = dp.brand ? `<span class="row-brand">${esc(dp.brand)}</span>` : "";
      html += swipeWrap(`<div class="list-row shopping-list-row ${item.checked ? "checked" : ""}" data-list-item-id="${item.id}"><div class="item-check"><input type="checkbox" aria-label="Segna ${esc(dp.title)} come acquistato" data-check-item="${item.id}" ${item.checked ? "checked" : ""}></div><button type="button" class="row-button item-body" data-edit-item="${item.id}" aria-label="Modifica ${esc(dp.title)}"><span class="item-top-row"><span class="row-name">${dp.titleHtml}</span><span class="row-qty">${qtyText}</span></span>${brandRow}<span class="item-bottom-row"><span class="row-cat">${catHtml}</span><span class="row-price${hasPrice ? "" : " is-nd"}">${priceText}</span></span></button></div>`, "swipe-shopping");
    }
    if (lastStore !== "") html += "</div>";
  }
  html += '<div class="list-spacer" aria-hidden="true"></div>';
  main.innerHTML = html;
  window.scrollTo(0, prevPageScroll);
  bindSwipeDelete(main, "[data-list-item-id]", (row) => removeItemWithUndo(row.dataset.listItemId));
  $("#addItemBtn").addEventListener("click", () => openAddItem());
  $("#clearListBtn").addEventListener("click", openListMenu);
  $("#resetListQuickBtn")?.addEventListener("click", () => clearOrReset(true));
  $("#emptyListQuickBtn")?.addEventListener("click", () => clearOrReset(false));
  const saveFilter = () => {
    try {
      localStorage.setItem("spesaSuMisura.selectedStore", state.selectedStore);
      localStorage.setItem("spesaSuMisura.selectedStores", JSON.stringify(state.selectedStores));
      localStorage.setItem("spesaSuMisura.selectedCategory", state.selectedCategory);
    } catch (_) {}
  };
  wireSingleFilter("listStoreFilter", {
    searchMaxLength: 20,
    searchUppercase: true,
    onSelect: async (val) => {
      state.selectedStore = val || "all";
      state.selectedStores = state.selectedStore === "all" ? ["all"] : [state.selectedStore === "__none__" ? "none" : state.selectedStore];
      saveFilter();
      await renderList();
    }
  });
  wireSingleFilter("listCatFilter", {
    searchMaxLength: 25,
    searchUppercase: true,
    onSelect: async (val) => {
      state.selectedCategory = val || "all";
      saveFilter();
      await renderList();
    }
  });
  $("#resetListFilters")?.addEventListener("click", async () => {
    state.selectedStore = "all";
    state.selectedStores = ["all"];
    state.selectedCategory = "all";
    saveFilter();
    await renderList();
  });
  main.querySelectorAll("[data-check-item]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("change", async (e) => {
      e.stopPropagation();
      const it = await getOne("shoppingListItems", el.dataset.checkItem);
      if (!it) return;
      it.checked = el.checked;
      it.updatedAt = now();
      await putOne("shoppingListItems", it);
      await renderList();
      checkCelebration();
    });
  });
  main.querySelectorAll("[data-edit-item]").forEach((el) => el.addEventListener("click", () => openQuickEdit(el.dataset.editItem)));
  updateScrollTopButton();
  updateFloatingAddButton();
}

export async function checkCelebration() {
  const visible = await visibleListItems();
  if (!visible.length || !visible.every((i) => i.checked)) {
    state.celebrationShownFor = "";
    return;
  }
  const key = `${state.selectedStore}|${state.selectedCategory}:` + visible.map((i) => i.id).sort().join(",");
  if (state.celebrationShownFor === key) return;
  state.celebrationShownFor = key;
  const prices = await getAll("productPrices");
  let totalCents = 0;
  for (const i of visible) {
    const pr = prices.find((x) => x.productId === i.productId && x.storeId === i.storeId);
    const hasManual = (i.manualUnitPriceMinor !== undefined && i.manualUnitPriceMinor !== null) || (i.manualAmountMinor !== undefined && i.manualAmountMinor !== null);
    if (!hasManual && (!i.storeId || !pr)) continue;
    const cents = i.manualUnitPriceMinor !== undefined && i.manualUnitPriceMinor !== null
      ? Math.round(i.manualUnitPriceMinor * i.quantity)
      : (i.manualAmountMinor !== undefined && i.manualAmountMinor !== null ? i.manualAmountMinor : Math.round(pr.amountMinor * i.quantity));
    totalCents += cents;
  }
  const totalFormatted = (totalCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
  const countWord = visible.length === 1 ? "Articolo" : "Articoli";
  const art = `<img src="${state.CART_CELEBRATION_IMG}" class="cart-art" alt="Carrello della spesa colmo di prodotti" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='./public/CarrelloSpesa.webp';}else if(this.dataset.fb==='1'&&CART_CELEBRATION_DATA_URI){this.dataset.fb='2';this.src=CART_CELEBRATION_DATA_URI;}" />`;
  const summaryHtml = `<div class="celebrate-summary" id="celebrateTotalLine"><div class="celebrate-stat"><span class="celebrate-stat-lbl">${countWord}</span><span class="celebrate-stat-val">${visible.length}</span></div><div class="celebrate-stat-sep" aria-hidden="true"></div><div class="celebrate-stat celebrate-stat-total"><span class="celebrate-stat-lbl">Totale</span><span class="celebrate-stat-val">${totalFormatted}</span></div></div>`;
  modal("", `<div class="money-celebration"><div class="money-art">${art}</div><div class="celebrate-title">Vai in cassa!</div>${summaryHtml}</div>`, [{ label: "Chiudi", class: "btn-primary", action: closeModal }], { closeButton: false, backdropClose: false });
}

export async function openAddItem() {
  const products = await allProductsSorted(), catList = await allCategoriesSorted(), stores2 = await allStoresSorted(), assoc = await getAll("productStores");
  const prodStoreMap = new Map();
  for (const a of assoc) {
    let s = prodStoreMap.get(a.productId);
    if (!s) {
      s = new Set();
      prodStoreMap.set(a.productId, s);
    }
    s.add(a.storeId);
  }
  const hasInStore = (p, sid) => {
    if (!sid) return true;
    const s = prodStoreMap.get(p.id);
    if (sid === "__none__") return !s || s.size === 0;
    return !!s && s.has(sid);
  };
  const asv = state.addItemViewState;
  if (typeof asv.store !== "string" || (asv.store !== "all" && asv.store !== "__none__" && !stores2.some((x) => x.id === asv.store))) asv.store = "all";
  if (typeof asv.cat !== "string" || (asv.cat !== "all" && asv.cat !== "__none__" && !catList.some((c) => c.id === asv.cat))) asv.cat = "all";
  const matchesStore = (p, sid) => sid === "all" || hasInStore(p, sid);
  const matchesCat = (p, cid) => cid === "all" || (cid === "__none__" ? !p.categoryId : p.categoryId === cid);
  const computeOpts = () => {
    const storeVal = asv.store, catVal = asv.cat;
    const storeOpts = [{ id: "__none__", label: "Senza supermercato", html: '<span style="font-style:italic">Senza supermercato</span>' }].concat(stores2.map((x) => ({ id: x.id, label: x.name, html: storeHasColors(x) ? storeChipHtml(x) : "" }))).map((o) => ({
      ...o,
      disabled: o.id !== storeVal && !products.some((p) => hasInStore(p, o.id) && matchesCat(p, catVal))
    }));
    const catOpts = [{ id: "__none__", label: "Senza reparto", html: '<span style="font-style:italic">Senza reparto</span>' }].concat(catList.map((c) => ({ id: c.id, label: c.name }))).map((o) => ({
      ...o,
      disabled: o.id !== catVal && !products.some((p) => matchesStore(p, storeVal) && (o.id === "__none__" ? !p.categoryId : p.categoryId === o.id))
    }));
    return { storeOpts, catOpts, showAllStores: storeVal === "all", showAllCats: catVal === "all", allStoresDisabled: storeOpts.every((o) => o.disabled), allCatsDisabled: catOpts.every((o) => o.disabled) };
  };
  let curOpts = computeOpts();
  const body = `<div class="prod-filters-box prod-filters-split"><div class="prod-filters-head"><span class="prod-filters-title">Filtra per</span><button type="button" class="filter-clear" id="resetAddFilters" aria-label="Azzera tutti i filtri" title="Azzera tutti i filtri">${SVG_FILTER_CLEAR}</button></div><div class="prod-filters-grid">${singleFilterHtml({ id: "addStoreFilter", allLabel: "Tutti i supermercati", options: curOpts.storeOpts, selectedValue: asv.store, allDisabled: curOpts.allStoresDisabled, searchMaxLength: 20, searchUppercase: true })}${singleFilterHtml({ id: "addCatFilter", allLabel: "Tutti i reparti", options: curOpts.catOpts, selectedValue: asv.cat, allDisabled: curOpts.allCatsDisabled, searchMaxLength: 25, searchUppercase: true })}</div></div><div class="field add-search-row"><input id="productSearch" type="search" class="search-input" maxlength="25" placeholder="Cerca articolo o marca\u2026" aria-label="Cerca articolo o marca" autocomplete="off"><button type="button" class="create-product-btn-square" id="addFromListNewProdBtn" aria-label="Crea un nuovo articolo" title="Crea un nuovo articolo"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:25px;height:25px"><rect x="3" y="3.5" width="13.5" height="15.5" rx="3" fill="#2d6ea9"/><path d="M6 7.5h7.5M6 11h5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.2" cy="17.2" r="5.2" fill="#159447" stroke="#ffffff" stroke-width="1.3"/><path d="M17.2 14.5v5.4M14.5 17.2h5.4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><div id="productChoices"></div>`;
  modal("Aggiungi articolo alla lista", body, [], {
    closeButton: true,
    backdropClose: false,
    onClose: () => {
      state.addItemViewState.cat = "all";
      state.addItemViewState.query = "";
      state.addItemViewState.scrollTop = 0;
      renderList();
    },
    alignTop: true,
    themed: true
  });
  const inp = $("#productSearch"), choices = $("#productChoices");
  {
    const hh = $("#modalRoot .modal-header");
    hh.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Cerca un articolo e aggiungilo.<br>Se non c'\xE8 crealo, premendo sull'icona di fianco alla casella di Ricerca.</div>`);
  }
  inp.value = (state.addItemViewState.query || "").slice(0, 25);
  $("#addFromListNewProdBtn")?.addEventListener("click", () => openProductForm(null, "addItem"));
  const paint = async () => {
    curOpts = computeOpts();
    updateSingleFilterUI("addStoreFilter", { allLabel: "Tutti i supermercati", options: curOpts.storeOpts, selectedValue: asv.store, allDisabled: curOpts.allStoresDisabled });
    updateSingleFilterUI("addCatFilter", { allLabel: "Tutti i reparti", options: curOpts.catOpts, selectedValue: asv.cat, allDisabled: curOpts.allCatsDisabled });
    const rf = $("#resetAddFilters");
    if (rf) {
      const storeFiltered = !curOpts.allStoresDisabled && !curOpts.showAllStores;
      const catFiltered = !curOpts.allCatsDisabled && !curOpts.showAllCats;
      const act = !!(storeFiltered || catFiltered || inp.value.trim());
      rf.disabled = !act;
      rf.classList.toggle("dim", !act);
    }
    const scoped = products.filter((p) => matchesStore(p, asv.store) && matchesCat(p, asv.cat));
    const filtered = filterBySearch(scoped, inp.value, productSearchText);
    const items = await activeItems(), itemByProduct = new Map(items.map((i) => [i.productId, i]));
    choices.innerHTML = filtered.length ? filtered.map((p) => {
      const existing = itemByProduct.get(p.id);
      const dp = productDisplayParts(p);
      const brandRow = dp.brand ? `<span class="row-brand">${esc(dp.brand)}</span>` : '<span class="row-brand is-empty" aria-hidden="true">&nbsp;</span>';
      if (existing) {
        return swipeWrap(`<div class="choice-row already-in-list" data-remove-added-product="${existing.id}"><div class="choice-main"><span class="item-top-row"><strong class="row-name fit-name">${dp.titleHtml}</strong><span class="row-qty">${esc(displayUnit(p))}</span></span>${brandRow}</div></div>`, "swipe-choice");
      }
      return `<button type="button" class="choice-row choice-row-3d" data-add-product="${p.id}" aria-label="Aggiungi ${esc(dp.title)} alla lista"><span class="choice-main"><span class="item-top-row"><strong class="row-name fit-name">${dp.titleHtml}</strong><span class="row-qty">${esc(displayUnit(p))}</span></span>${brandRow}</span></button>`;
    }).join("") : '<div class="empty">Nessun articolo trovato.</div>';
    choices.querySelectorAll("[data-add-product]").forEach((b) => b.addEventListener("click", () => addProductToList(b.dataset.addProduct)));
    bindSwipeDelete(choices, "[data-remove-added-product]", async (row) => {
      const itemId = row.dataset.removeAddedProduct, item = await getOne("shoppingListItems", itemId);
      if (!item) return;
      state.addItemViewState.query = inp.value;
      state.addItemViewState.scrollTop = $("#modalRoot .modal")?.scrollTop || 0;
      await delOne("shoppingListItems", itemId);
      await openAddItem();
      showUndoToast("Articolo rimosso dalla lista", async () => {
        await putOne("shoppingListItems", item);
        if ($("#productChoices")) await openAddItem();
        else if (state.page === "list") await renderList();
      });
    });
  };
  wireSingleFilter("addStoreFilter", {
    searchMaxLength: 20,
    searchUppercase: true,
    onSelect: (val) => {
      asv.store = val || "all";
      asv.scrollTop = 0;
      paint();
    }
  });
  wireSingleFilter("addCatFilter", {
    searchMaxLength: 25,
    searchUppercase: true,
    onSelect: (val) => {
      asv.cat = val || "all";
      asv.scrollTop = 0;
      paint();
    }
  });
  $("#resetAddFilters").addEventListener("click", () => {
    asv.store = "all";
    asv.cat = "all";
    asv.query = "";
    asv.scrollTop = 0;
    inp.value = "";
    paint();
  });
  attachSearchClear(inp, () => {
    state.addItemViewState.query = "";
    paint();
  });
  inp.addEventListener("input", () => {
    if (inp.value.length > 25) inp.value = inp.value.slice(0, 25);
    state.addItemViewState.query = inp.value;
    state.addItemViewState.scrollTop = 0;
    paint();
  });
  const modalEl = $("#modalRoot .modal");
  if (modalEl) {
    modalEl.addEventListener("scroll", () => {
      state.addItemViewState.scrollTop = modalEl.scrollTop;
      state.addItemViewState.query = inp.value;
    }, { passive: true });
  }
  await paint();
  if (modalEl) modalEl.scrollTop = state.addItemViewState.scrollTop || 0;
}

export async function addProductToList(productId) {
  const search = $("#productSearch"), panel = $("#modalRoot .modal");
  if (search) state.addItemViewState.query = search.value;
  if (panel) state.addItemViewState.scrollTop = panel.scrollTop;
  const p = await getOne("products", productId);
  if (!p) return;
  const items = await activeItems();
  if (items.some((i) => i.productId === productId)) {
    await openQuickEdit(items.find((i) => i.productId === productId).id);
    return;
  }
  await openNewListItemEditor(productId);
}

export function assignEditorHtml(p, qtyVal, curStore, available, listPriceMinor, initialManualVal, initialFreeOffer = false) {
  const unit = displayUnit(p);
  const dp = productDisplayParts(p);
  const brandRow = dp.brand ? `<span class="assign-product-brand">${esc(dp.brand)}</span>` : "";
  const initialListVal = listPriceMinor !== null && listPriceMinor !== undefined ? (listPriceMinor / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : "";
  return `<div class="assign-editor">
    <div class="assign-product-card">
      <div class="assign-product-top">
        <span class="assign-product-name">${dp.titleHtml}</span>
        <span class="assign-product-unit">${esc(unit)}</span>
      </div>
      ${brandRow}
    </div>
    <div class="assign-qty-row">
      <label for="quickQty">Quantit\xE0<br>[${esc(unit)}]</label>
      <div class="qty-row">
        <div class="name-box"><input id="quickQty" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" translate="no" spellcheck="false" value="${esc(qtyVal)}"><button type="button" class="name-no" id="quickQtyNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="quickQtyOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div>
        <button type="button" id="qtyMinus" aria-label="Diminuisci quantit\xE0">\u2212</button>
        <button type="button" id="qtyPlus" aria-label="Aumenta quantit\xE0">\uFF0B</button>
      </div>
    </div>
    <div class="field assign-store-field">
      <label for="quickStore">Supermercato</label>
      ${customDropdown("quickStore", curStore, available, true, true)}
    </div>
    <div class="assign-pricing-card">
      <div class="inline-note manual-amount-box assign-discount-row assign-list-row" id="quickListPriceBox">
        <label for="listPriceInput"><strong>Prezzo Unit.<br>di LISTINO</strong></label>
        <div class="manual-input-wrap">
          <div class="name-box"><input id="listPriceInput" type="text" inputmode="decimal" enterkeyhint="done" maxlength="6" placeholder="${curStore ? "0,00" : "N/D"}" autocomplete="off" translate="no" spellcheck="false" value="${esc(initialListVal)}"${curStore ? "" : " disabled"}><button type="button" class="name-no" id="listPriceNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="listPriceOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><span class="price-eur">&euro;/${esc(unit)}</span>
        </div>
      </div>
      <div class="inline-note manual-amount-box assign-discount-row${initialFreeOffer ? " is-free-disabled" : ""}" id="quickManualBox"${initialFreeOffer ? " inert" : ""}>
        <label for="manualPriceInput"><strong>Prezzo Unit.<br>SCONTATO</strong></label>
        <div class="manual-input-wrap">
          <div class="name-box"><button type="button" class="manual-price-clear" id="manualPriceClear" aria-label="Cancella prezzo scontato" title="Cancella prezzo scontato" hidden>${SVG_CIRCLE_X}</button><input id="manualPriceInput" type="text" inputmode="decimal" enterkeyhint="done" maxlength="8" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" value="${esc(initialManualVal)}"${initialFreeOffer ? ' disabled readonly tabindex="-1" aria-disabled="true"' : ""}><button type="button" class="name-no" id="manualPriceNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="manualPriceOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><span class="price-eur">&euro;/${esc(unit)}</span>
        </div>
      </div>
      <div class="assign-free-offer-row">
        <label class="check-line free-offer-opt" for="manualFreeOffer"><input type="checkbox" id="manualFreeOffer"${initialFreeOffer ? " checked" : ""}><span>Articolo in offerta gratuita</span></label>
      </div>
      <div class="assign-total-row" id="quickAmount"></div>
    </div>
  </div>`;
}

export async function openNewListItemEditor(productId, ov = null) {
  const p = await getOne("products", productId);
  if (!p) return;
  const ss = await allStoresSorted(), assoc = await storeIdsForProduct(p.id), st = await settings(), prices = await getAll("productPrices");
  let initialStore = null;
  const ids = assoc;
  if (st.defaultStoreId) initialStore = st.defaultStoreId;
  else if (ids.length === 1) initialStore = ids[0];
  if (ov) initialStore = ov.store || null;
  const available = ss.filter((s) => ids.includes(s.id) || s.id === st.defaultStoreId || ov && s.id === ov.store).map((s) => {
    const pr = prices.find((x) => x.productId === p.id && x.storeId === s.id);
    const chip = storeHasColors(s) ? storeChipHtml(s) : "";
    const nameHtml = chip || `<span class="dd-opt-name">${esc(s.name)}</span>`;
    const priceHtml = pr ? `<span class="dd-opt-price">${esc(moneyPerUnit(pr.amountMinor, p))}</span>` : "";
    return { ...s, menuName: pr ? `${s.name} ${moneyPerUnit(pr.amountMinor, p)}` : s.name, labelHtml: nameHtml, menuHtml: pr ? `${nameHtml}${priceHtml}` : nameHtml };
  });
  const initialFreeOffer = !!(ov && ov.freeOffer);
  const initialManualVal = ov && ov.manualAmount !== undefined ? ov.manualAmount : "";
  const initialPrice = initialStore ? prices.find((x) => x.productId === p.id && x.storeId === initialStore) : null;
  const body = assignEditorHtml(p, ov ? ov.qty : fmtQtyUnit(1, p.unit), initialStore, available, initialPrice ? initialPrice.amountMinor : null, initialManualVal, initialFreeOffer);
  let listPriceState = null;
  modal("Modifica assegnazioni", body, [{ label: "Annulla", class: "btn-plain", action: () => closeModal() }, { label: "Aggiungi", class: "btn-primary", action: async () => {
    const q = parseQty($("#quickQty").value);
    if (!qtyValid(q, p.unit)) {
      showToast(p.unit === "pz" || p.unit === "pz." ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
      return;
    }
    const sid = $("#quickStore").value || null;
    const listVal = $("#listPriceInput")?.value.trim() ?? "";
    const listMinor = sid ? eurosFromInput(listVal) : null;
    if (sid && Number.isNaN(listMinor)) {
      showToast("Controlla il prezzo di listino inserito.");
      return;
    }
    const isFreeOffer = !!$("#manualFreeOffer")?.checked;
    let validManMinor = null;
    if (isFreeOffer) {
      validManMinor = 0;
    } else {
      const manVal = $("#manualPriceInput")?.value.trim() ?? "";
      const manMinor = eurosFromInput(manVal);
      if (Number.isNaN(manMinor)) {
        showToast("Controlla il prezzo unitario manuale inserito.");
        return;
      }
      validManMinor = manMinor !== null && manMinor > 0 ? manMinor : null;
    }
    if (sid && listPriceState) listPriceState.editedPrices.set(sid, listMinor);
    if (listPriceState) await saveEditedListPrices(p.id, listPriceState.editedPrices);
    await actuallyAddItem(p.id, sid, q, validManMinor !== null ? Math.round(validManMinor * q) : null, validManMinor);
    state.currentModal = null;
    state.currentModalKeep = false;
    await openAddItem();
    showToast("Articolo aggiunto alla lista");
  } }], { closeButton: false, backdropClose: false, keepModalOnClose: true, onClose: () => openAddItem(), alignTop: true, themed: true });
  {
    const h = $("#modalRoot .modal-header");
    h.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    h.insertAdjacentHTML("afterend", '<div class="info-pop" hidden>Qui si possono modificare la quantit\xE0 ed il supermercato dove si acquister\xE0 l\u2019articolo.<br>Inoltre si pu\xF2 aggiornare il Prezzo unitario di LISTINO o inserire quello SCONTATO, relativo a eventuali promozioni in corso.</div>');
  }
  wireCustomDropdown("quickStore");
  listPriceState = wireListPrice(p, prices);
  wireQuickQty(p);
  wireAmount(p, prices);
  wireManualAmount(initialManualVal, initialFreeOffer);
  fitStoreChipLabels($("#modalRoot"));
}

export function wireQuickQty(p) {
  const inp = $("#quickQty");
  if (!inp) return;
  const box = inp.closest(".name-box");
  const noBtn = $("#quickQtyNo");
  const okBtn = $("#quickQtyOk");
  let savedVal = inp.value.trim();

  const syncState = (isEditing) => {
    box?.classList.toggle("editing", !!isEditing);
  };
  syncState(false);

  const startEdit = () => {
    if (!box || box.classList.contains("editing")) return;
    savedVal = inp.value;
    syncState(true);
  };

  inp.addEventListener("focus", startEdit);
  inp.addEventListener("click", startEdit);

  const commit = (fromBlur = false) => {
    const raw = inp.value.trim();
    const q = parseQty(raw);
    if (qtyValid(q, p.unit)) {
      savedVal = fmtQtyUnit(q, p.unit);
      inp.value = savedVal;
    } else if (!fromBlur) {
      showToast(p.unit === "pz" || p.unit === "pz." ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
      return false;
    } else {
      savedVal = raw;
    }
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    if (!fromBlur) {
      inp.blur();
      releaseModalKeyboard();
    }
    return true;
  };

  const cancel = () => {
    inp.value = savedVal;
    syncState(false);
    inp.dispatchEvent(new Event("input"));
    inp.blur();
    releaseModalKeyboard();
  };

  noBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  noBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    cancel();
  });
  okBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  okBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    commit(false);
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      commit(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  inp.addEventListener("blur", () => {
    if (box && box.classList.contains("editing")) {
      commit(true);
    }
  });

  $("#qtyMinus")?.addEventListener("click", () => {
    const q = parseQty(inp.value) || 1;
    const next = fmtQtyUnit(quantityStepValue(q, p.unit, -1), p.unit);
    inp.value = next;
    savedVal = next;
    syncState(false);
  });
  $("#qtyPlus")?.addEventListener("click", () => {
    const q = parseQty(inp.value) || 0;
    const next = fmtQtyUnit(quantityStepValue(q, p.unit, 1), p.unit);
    inp.value = next;
    savedVal = next;
    syncState(false);
  });
}

export async function actuallyAddItem(productId, storeId, quantity = 1, manualAmountMinor = null, manualUnitPriceMinor = null) {
  const l = await activeList(), items = await activeItems();
  if (items.some((i) => i.productId === productId)) {
    showToast("L\u2019articolo \xE8 gi\xE0 nella lista");
    return;
  }
  const it = { id: uuid(), listId: l.id, productId, storeId, quantity, manualAmountMinor, manualUnitPriceMinor, checked: false, createdAt: now(), updatedAt: now() };
  await putOne("shoppingListItems", it);
}

export async function openQuickEdit(itemId, ov = null) {
  const item = await getOne("shoppingListItems", itemId), p = item && await getOne("products", item.productId);
  if (!item || !p) return;
  const ss = await allStoresSorted(), assoc = await storeIdsForProduct(p.id), st = await settings(), prices = await getAll("productPrices");
  const curStore = ov ? ov.store : item.storeId, available = ss.filter((s) => assoc.includes(s.id) || s.id === item.storeId || s.id === st.defaultStoreId || s.id === curStore).map((s) => {
    const pr = prices.find((x) => x.productId === p.id && x.storeId === s.id);
    const chip = storeHasColors(s) ? storeChipHtml(s) : "";
    const nameHtml = chip || `<span class="dd-opt-name">${esc(s.name)}</span>`;
    const priceHtml = pr ? `<span class="dd-opt-price">${esc(moneyPerUnit(pr.amountMinor, p))}</span>` : "";
    return { ...s, menuName: pr ? `${s.name} ${moneyPerUnit(pr.amountMinor, p)}` : s.name, labelHtml: nameHtml, menuHtml: pr ? `${nameHtml}${priceHtml}` : nameHtml };
  });
  const currentPrice = prices.find((x) => x.productId === p.id && x.storeId === curStore);
  const isExistingFree = item.manualUnitPriceMinor === 0 || ((item.manualUnitPriceMinor === null || item.manualUnitPriceMinor === undefined) && item.manualAmountMinor === 0);
  const initialFreeOffer = ov && ov.freeOffer !== undefined ? !!ov.freeOffer : isExistingFree;
  const initialManualVal = ov && ov.manualAmount !== undefined ? ov.manualAmount : (!isExistingFree ? (item.manualUnitPriceMinor !== null && item.manualUnitPriceMinor !== undefined ? (item.manualUnitPriceMinor / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (item.manualAmountMinor !== null && item.manualAmountMinor !== undefined ? (item.manualAmountMinor / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "")) : "");
  const body = assignEditorHtml(p, ov ? ov.qty : fmtQtyUnit(item.quantity, p.unit), curStore, available, currentPrice ? currentPrice.amountMinor : null, initialManualVal, initialFreeOffer);
  let listPriceState = null;
  modal("Modifica assegnazioni", body, [{ label: "Annulla", class: "btn-plain", action: () => closeModal() }, { label: "Salva modifiche", class: "btn-primary", action: async () => {
    const q = parseQty($("#quickQty").value);
    if (!qtyValid(q, p.unit)) {
      showToast(p.unit === "pz" || p.unit === "pz." ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
      return;
    }
    const sid = $("#quickStore").value || null;
    const listVal = $("#listPriceInput")?.value.trim() ?? "";
    const listMinor = sid ? eurosFromInput(listVal) : null;
    if (sid && Number.isNaN(listMinor)) {
      showToast("Controlla il prezzo di listino inserito.");
      return;
    }
    const isFreeOffer = !!$("#manualFreeOffer")?.checked;
    let validManMinor = null;
    if (isFreeOffer) {
      validManMinor = 0;
    } else {
      const manVal = $("#manualPriceInput")?.value.trim() ?? "";
      const manMinor = eurosFromInput(manVal);
      if (Number.isNaN(manMinor)) {
        showToast("Controlla il prezzo unitario manuale inserito.");
        return;
      }
      validManMinor = manMinor !== null && manMinor > 0 ? manMinor : null;
    }
    if (sid && listPriceState) listPriceState.editedPrices.set(sid, listMinor);
    if (listPriceState) await saveEditedListPrices(p.id, listPriceState.editedPrices);
    item.quantity = q;
    item.storeId = sid;
    item.manualUnitPriceMinor = validManMinor;
    item.manualAmountMinor = validManMinor !== null ? Math.round(validManMinor * q) : null;
    item.updatedAt = now();
    await putOne("shoppingListItems", item);
    closeModal();
    render();
  } }], { closeButton: false, backdropClose: false, alignTop: true, themed: true });
  {
    const h = $("#modalRoot .modal-header");
    h.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    h.insertAdjacentHTML("afterend", '<div class="info-pop" hidden>Qui si possono modificare la quantit\xE0 ed il supermercato dove si acquister\xE0 l\u2019articolo.<br>Inoltre si pu\xF2 aggiornare il Prezzo unitario di LISTINO o inserire quello SCONTATO, relativo a eventuali promozioni in corso.</div>');
  }
  wireCustomDropdown("quickStore");
  listPriceState = wireListPrice(p, prices);
  wireQuickQty(p);
  wireAmount(p, prices);
  wireManualAmount(initialManualVal, initialFreeOffer);
  fitStoreChipLabels($("#modalRoot"));
}
