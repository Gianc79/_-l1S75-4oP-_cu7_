// Gestione supermercati, percorsi reparti, colori e copia configurazione
import { state } from "./state.js";
import { HEX_CHROMATIC_ROWS, HEX_GRAY_ROWS, SVG_CHK, SVG_CIRCLED_PLUS, SVG_FILTER_CLEAR, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, autoTextColor, esc, norm, normHex6, now, storeChipHtml, storeHasColors, uuid } from "./calculations.js";
import { allCategoriesSorted, allStoresSorted, getAll, getOne, putOne, setDefaultStore, settings, txDone } from "./storage.js";
import { bindSwipeDelete, closeModal, confirmDialog, customDropdown, forceUppercaseInput, infoPop, modal, selectAllOnFocus, showToast, showUndoToast, singleFilterHtml, swipeWrap, updateSingleFilterUI, wireCustomDropdown, wireSingleFilter } from "./ui.js";
import { openNewCategoryWindow } from "./categories.js";

export function openStoreForm() {
  const ssPromise = allStoresSorted();
  let confirmed = "";
  const setStatus = (msg, type = "") => {
    const el = $("#storeNameStatus");
    if (!el) return;
    el.textContent = msg;
    el.className = "field-status" + (type === "error" ? " is-error" : "");
  };
  const check = async () => {
    const ss = await ssPromise;
    const name = $("#storeName").value.trim().toLocaleUpperCase("it");
    if (!name) {
      setStatus("");
      showToast("Inserisci il nome del supermercato.");
      return "";
    }
    if (name.length > 20) {
      setStatus("Massimo 20 caratteri.", "error");
      return "";
    }
    if (ss.some((x) => x.nameNormalized === norm(name))) {
      setStatus("Supermercato gi\xE0 presente.", "error");
      return "";
    }
    setStatus("");
    return name;
  };
  const create = async (name) => {
    const none = !(await getAll("stores")).length;
    const store = { id: uuid(), name, nameNormalized: norm(name), createdAt: now(), updatedAt: now() };
    await putOne("stores", store);
    if (none) {
      const cur = await settings();
      await putOne("settings", { ...cur, defaultStoreId: store.id });
    }
    return store;
  };
  modal(
    "Nuovo supermercato",
    `<div class="field" style="margin-bottom:28px"><div class="label-row"><label for="storeName">Nome <span class="label-hint">(max 20 caratteri)</span></label><span class="field-status" id="storeNameStatus" aria-live="polite"></span></div><div class="name-box"><input id="storeName" type="text" maxlength="20" autocomplete="off" autocapitalize="characters"><button type="button" class="name-no" id="storeNameNew" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="storeNameOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button></div><div class="store-name-tip">In caso di pi\xF9 punti vendita appartenenti alla stessa catena, \xE8 consigliabile inserire anche la localit\xE0 (es. NOMECATENA LOCALITA').</div></div>`,
    [
      { label: "Annulla", class: "btn-plain", action: () => closeModal(false) },
      { label: "Configura", class: "btn-primary", action: async () => {
        const name = await check();
        if (!name) return;
        const store = await create(name);
        state.currentModal = null;
        state.currentModalKeep = false;
        await openManageCategories(store.id);
        renderStores();
        showToast("Supermercato aggiunto");
      } }
    ],
    { closeButton: false, alignTop: true, backdropClose: false, themed: true, onClose: async () => {
      if (confirmed && !(await getAll("stores")).some((x) => x.nameNormalized === norm(confirmed))) {
        await create(confirmed);
        showToast("Supermercato aggiunto");
      }
      await renderStores();
    } }
  );
  forceUppercaseInput($("#storeName"));
  const nb = $("#storeName").closest(".name-box"), updNb = () => {
    const v = $("#storeName").value.trim();
    nb.classList.toggle("dirty", !!v && v !== confirmed);
  };
  $("#storeNameOk").addEventListener("click", async () => {
    const name = await check();
    if (name) {
      confirmed = name;
      $("#storeName").blur();
      updNb();
    }
  });
  $("#storeName").addEventListener("input", () => {
    confirmed = "";
    setStatus("");
    updNb();
  });
  $("#storeNameNew").addEventListener("mousedown", (e) => e.preventDefault());
  $("#storeNameNew").addEventListener("click", () => {
    $("#storeName").value = "";
    confirmed = "";
    setStatus("");
    updNb();
    $("#storeName").blur();
  });
  $("#storeName")?.focus({ preventScroll: true });
}

export async function renderStores() {
  const [ss, routes, stg] = await Promise.all([allStoresSorted(), getAll("storeCategoryRoutes"), settings()]);
  const cnt = (id) => routes.filter((r) => r.storeId === id).length;
  if (typeof state.storesSelectedFilter !== "string" || (state.storesSelectedFilter !== "all" && !ss.some((x) => x.id === state.storesSelectedFilter))) state.storesSelectedFilter = "all";
  const allDisabled = ss.length === 0;
  const storeOpts = ss.map((x) => ({ id: x.id, label: x.name, html: storeChipHtml(x), disabled: false }));
  const computeStoreFilter = () => {
    const showAll = state.storesSelectedFilter === "all";
    return { showAll, filterActive: !allDisabled && !showAll };
  };
  const initSF = computeStoreFilter();
  $("#appMain").innerHTML = `<div class="toolbar"><div class="title-row"><h1>Supermercati</h1><span class="title-count-badge" id="storesCount">${ss.length}</span>${infoBtn}</div><button type="button" class="header-icon trash-mini${ss.length ? "" : " dim"}" id="delAllStoresBtn" ${ss.length ? "" : "disabled"} aria-label="Elimina tutti i supermercati" title="Elimina tutti i supermercati">${TRASH_OFFICE}</button></div>${infoPop("Crea e gestisci il database dei tuoi supermercati.<br>Seleziona il supermercato predefinito, tenendo premuto sul relativo riquadro.<br>Per eliminare un singolo supermercato, scorri il relativo riquadro verso destra.")}<div class="sticky-action-wrap list-sticky-btn-wrap stores-action-wrap"><button class="btn btn-primary btn-block" id="newStoreBtn">${SVG_CIRCLED_PLUS}<span>Aggiungi un nuovo supermercato</span></button></div><div class="sticky-filter-wrap stores-filter-wrap"><div class="prod-filters-box"><div class="prod-filters-head"><span class="prod-filters-title">Filtra per</span><button type="button" class="filter-clear${initSF.filterActive ? "" : " dim"}" id="resetStoresFilter" ${initSF.filterActive ? "" : "disabled"} aria-label="Azzera filtro supermercati" title="Azzera filtro supermercati">${SVG_FILTER_CLEAR}<span>Azzera</span></button></div><div class="prod-filters-grid is-single">${singleFilterHtml({ id: "storesFilter", allLabel: "Tutti i supermercati", options: storeOpts, selectedValue: state.storesSelectedFilter, allDisabled })}</div></div></div><div id="storesListContainer"></div>`;
  const paint = async (curSettings = null) => {
    const curStg = curSettings || await settings();
    const sf = computeStoreFilter();
    updateSingleFilterUI("storesFilter", { allLabel: "Tutti i supermercati", options: storeOpts, selectedValue: state.storesSelectedFilter, allDisabled });
    const rf = $("#resetStoresFilter");
    if (rf) {
      rf.disabled = !sf.filterActive;
      rf.classList.toggle("dim", !sf.filterActive);
    }
    const filtered = sf.showAll ? ss : ss.filter((x) => x.id === state.storesSelectedFilter);
    const countEl = $("#storesCount");
    if (countEl) countEl.textContent = String(filtered.length);
    const container = $("#storesListContainer");
    container.innerHTML = filtered.length ? filtered.map((x) => {
      const n = cnt(x.id), isDef = x.id === curStg.defaultStoreId;
      return swipeWrap(`<div class="list-row compact${isDef ? " is-default" : ""}" data-delete-store="${x.id}"><button type="button" class="row-button" data-store="${x.id}"><span class="row-name">${storeChipHtml(x)}</span><div class="row-sub">${n} ${n === 1 ? "reparto" : "reparti"}</div></button>${isDef ? '<span class="badge-inuse badge-default">PREDEFINITO</span>' : ""}</div>`, "swipe-compact");
    }).join("") : `<div class="empty">${ss.length ? "Nessun supermercato per questo filtro." : "Non hai ancora creato supermercati. Puoi usare la lista anche senza supermercati."}</div>`;
    container.querySelectorAll("[data-delete-store]").forEach((row) => {
      let timer = null, fired = false, downX = 0, downY = 0;
      const id = row.dataset.deleteStore, cancel = () => {
        clearTimeout(timer);
        timer = null;
      };
      row.addEventListener("pointerdown", (e) => {
        fired = false;
        downX = e.clientX;
        downY = e.clientY;
        try { window.getSelection()?.removeAllRanges?.(); } catch (_) {}
        cancel();
        timer = setTimeout(() => {
          fired = true;
          setDefaultStore(id);
        }, 450);
      });
      row.addEventListener("pointermove", (e) => {
        if (timer && (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8)) cancel();
      });
      row.addEventListener("swipestart", cancel);
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => row.addEventListener(ev, cancel));
      row.addEventListener("contextmenu", (e) => e.preventDefault());
      row.addEventListener("click", () => {
        if (fired) {
          fired = false;
          return;
        }
        openManageCategories(id);
      });
    });
    bindSwipeDelete(container, "[data-delete-store]", async (row) => {
      const storeId = row.dataset.deleteStore;
      const stObj = await getOne("stores", storeId);
      if (!stObj) return false;
      const yes = await confirmDialog("Elimina supermercato", `Il supermercato \u201C${esc(stObj.name)}\u201D verr\xE0 rimosso definitivamente.<br>I relativi reparti ed articoli rimarranno regolarmente disponibili nel database.<br>Procedere comunque?`, "Elimina", { closeButton: false, backdropClose: false });
      if (!yes) return false;
      const [rList, psList, ppList, itemList, curStg2] = await Promise.all([getAll("storeCategoryRoutes"), getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems"), getOne("settings", "main")]);
      const snapRoutes = rList.filter((x) => x.storeId === storeId);
      const snapPs = psList.filter((x) => x.storeId === storeId);
      const snapPp = ppList.filter((x) => x.storeId === storeId);
      const snapItems = itemList.filter((x) => x.storeId === storeId).map((x) => ({ ...x }));
      const wasDefault = curStg2?.defaultStoreId === storeId;
      const tx = state.db.transaction(["stores", "storeCategoryRoutes", "productStores", "productPrices", "shoppingListItems", "settings", "tombstones"], "readwrite");
      for (const x of snapRoutes) tx.objectStore("storeCategoryRoutes").delete(x.id);
      for (const x of snapPs) tx.objectStore("productStores").delete(x.id);
      for (const x of snapPp) tx.objectStore("productPrices").delete(x.id);
      for (const x of snapItems) tx.objectStore("shoppingListItems").put({ ...x, storeId: null, updatedAt: now() });
      if (wasDefault) tx.objectStore("settings").put({ ...curStg2, defaultStoreId: null });
      tx.objectStore("stores").delete(storeId);
      tx.objectStore("tombstones").put({ id: uuid(), entityType: "store", entityId: storeId, deletedAt: now(), revision: Date.now() });
      await txDone(tx);
      state.selectedStore = "all";
      state.selectedStores = ["all"];
      localStorage.setItem("spesaSuMisura.selectedStores", JSON.stringify(state.selectedStores));
      await renderStores();
      showToast("Supermercato eliminato");
    });
  };
  wireSingleFilter("storesFilter", {
    onSelect: (val) => {
      state.storesSelectedFilter = val || "all";
      paint();
    }
  });
  $("#resetStoresFilter")?.addEventListener("click", () => {
    state.storesSelectedFilter = "all";
    paint();
  });
  await paint(stg);
  $("#newStoreBtn").onclick = () => openStoreForm();
  $("#delAllStoresBtn").onclick = async () => {
    if (!ss.length) return;
    if (!await confirmDialog("Elimina tutti i supermercati", "Tutti i supermercati verranno rimossi definitivamente.<br>I relativi reparti ed articoli rimarranno regolarmente disponibili nel database.<br>Procedere comunque?", "Elimina tutti", { backdropClose: false })) return;
    const [ps, pp, its, st0] = await Promise.all([getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems"), getOne("settings", "main")]);
    const tx = state.db.transaction(["stores", "storeCategoryRoutes", "productStores", "productPrices", "shoppingListItems", "settings", "tombstones"], "readwrite");
    for (const r of routes) tx.objectStore("storeCategoryRoutes").delete(r.id);
    ps.forEach((x) => tx.objectStore("productStores").delete(x.id));
    pp.forEach((x) => tx.objectStore("productPrices").delete(x.id));
    its.forEach((x) => {
      if (x.storeId) {
        x.storeId = null;
        x.updatedAt = now();
        tx.objectStore("shoppingListItems").put(x);
      }
    });
    if (st0) tx.objectStore("settings").put({ ...st0, defaultStoreId: null });
    for (const x of ss) {
      tx.objectStore("stores").delete(x.id);
      tx.objectStore("tombstones").put({ id: uuid(), entityType: "store", entityId: x.id, deletedAt: now(), revision: Date.now() });
    }
    await txDone(tx);
    state.selectedStores = ["all"];
    state.storesSelectedFilter = "all";
    localStorage.setItem("spesaSuMisura.selectedStores", JSON.stringify(state.selectedStores));
    await renderStores();
    showToast("Supermercati eliminati");
  };
}

export async function openStoreDetail(storeId) {
  await openManageCategories(storeId);
}

export function bindCategoryDrag(list, onReorder) {
  list.querySelectorAll("[data-route]").forEach((row) => {
    const handle = row.querySelector("[data-drag-handle]");
    if (!handle) return;
    let timer = null, drag = null, placeholder = null, pointerId = null, startX = 0, startY = 0, currentY = 0, autoFrame = null, initialBodyOverflow = "", dragLeft = 0, grabY = 0;
    const panel = () => $("#modalRoot .modal");
    const stopAuto = () => {
      if (autoFrame !== null) {
        cancelAnimationFrame(autoFrame);
        autoFrame = null;
      }
    };
    const currentOrder = () => [...list.querySelectorAll("[data-route]")].map((x) => x.dataset.route);
    const clearStyles = (el) => {
      if (!el) return;
      el.classList.remove("dragging");
      for (const prop of ["position", "left", "top", "width", "height", "zIndex", "pointerEvents", "margin"]) el.style[prop] = "";
    };
    const cleanup = (restore) => {
      clearTimeout(timer);
      timer = null;
      stopAuto();
      if (drag && placeholder?.parentNode && restore) {
        const dragItem = drag.closest(".swipe-wrap") || drag;
        placeholder.parentNode.insertBefore(dragItem, placeholder);
        placeholder.remove();
        onReorder(currentOrder());
      }
      if (drag) {
        const dragItem = drag.closest(".swipe-wrap") || drag;
        clearStyles(dragItem);
        drag.classList.remove("dragging");
      }
      placeholder?.remove();
      placeholder = null;
      drag = null;
      document.body.style.overflow = initialBodyOverflow;
    };
    const autoScroll = () => {
      if (!drag) {
        autoFrame = null;
        return;
      }
      const p = panel();
      if (p) {
        const r = p.getBoundingClientRect(), edge = 70;
        let d = 0;
        if (currentY < r.top + edge) d = -Math.min(13, Math.max(2, (r.top + edge - currentY) / 3));
        else if (currentY > r.bottom - edge) d = Math.min(13, Math.max(2, (currentY - (r.bottom - edge)) / 3));
        if (d) p.scrollTop = Math.max(0, Math.min(p.scrollHeight - p.clientHeight, p.scrollTop + d));
      }
      autoFrame = requestAnimationFrame(autoScroll);
    };
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = currentY = e.clientY;
      pointerId = e.pointerId;
      try {
        handle.setPointerCapture(pointerId);
      } catch (_) {
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!row.isConnected) return;
        drag = row;
        const dragItem = row.closest(".swipe-wrap") || row;
        const r = dragItem.getBoundingClientRect();
        dragLeft = r.left;
        grabY = currentY - r.top;
        placeholder = document.createElement("div");
        placeholder.className = "route-row placeholder";
        placeholder.style.height = r.height + "px";
        placeholder.style.marginBottom = getComputedStyle(dragItem).marginBottom;
        dragItem.parentNode.insertBefore(placeholder, dragItem.nextSibling);
        try {
          handle.setPointerCapture(pointerId);
        } catch (_) {
        }
        dragItem.style.width = r.width + "px";
        dragItem.style.height = r.height + "px";
        dragItem.style.margin = "0";
        dragItem.style.position = "fixed";
        dragItem.style.left = r.left + "px";
        dragItem.style.top = r.top + "px";
        dragItem.style.zIndex = "100";
        dragItem.style.pointerEvents = "none";
        row.classList.add("dragging");
        initialBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        autoFrame = requestAnimationFrame(autoScroll);
      }, 180);
      e.preventDefault();
    }, { passive: false });
    handle.addEventListener("pointermove", (e) => {
      currentY = e.clientY;
      if (!drag) {
        if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      e.preventDefault();
      const dragItem = drag.closest(".swipe-wrap") || drag;
      dragItem.style.left = dragLeft + "px";
      dragItem.style.top = e.clientY - grabY + "px";
      const rows = [...list.children].filter((x) => x !== dragItem && x !== placeholder && (x.matches("[data-route]") || x.querySelector("[data-route]")));
      const target = rows.find((x) => {
        const b = x.getBoundingClientRect();
        return e.clientY < b.top + b.height / 2;
      });
      if (target) list.insertBefore(placeholder, target);
      else list.appendChild(placeholder);
    }, { passive: false });
    const finish = (e) => {
      clearTimeout(timer);
      timer = null;
      if (!drag) return;
      try {
        handle.releasePointerCapture(pointerId);
      } catch (_) {
      }
      const dragItem = drag.closest(".swipe-wrap") || drag;
      if (placeholder?.parentNode) {
        placeholder.parentNode.insertBefore(dragItem, placeholder);
        placeholder.remove();
      }
      clearStyles(dragItem);
      drag.classList.remove("dragging");
      placeholder?.remove();
      placeholder = null;
      const next = currentOrder();
      drag = null;
      stopAuto();
      document.body.style.overflow = initialBodyOverflow;
      Promise.resolve(onReorder(next)).catch((err) => {
        console.error(err);
        showToast("Impossibile salvare la sequenza dei reparti");
      });
      e?.preventDefault?.();
    };
    handle.addEventListener("pointerup", finish, { passive: false });
    handle.addEventListener("pointercancel", () => cleanup(true));
  });
}

export async function openManageCategories(storeId) {
  const s = await getOne("stores", storeId);
  if (!s) return;
  let cats = await allCategoriesSorted(), routes = (await getAll("storeCategoryRoutes")).filter((r) => r.storeId === storeId).sort((a, b) => a.position - b.position);
  let order = routes.map((r) => r.categoryId).filter((id, i, a) => cats.some((c) => c.id === id) && a.indexOf(id) === i);
  const copySvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="12" height="15" rx="1.8" fill="white" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="7" width="12" height="14" rx="1.8" fill="white" stroke="currentColor" stroke-width="1.8"/><path d="M9 10h5M9 13h5M9 16h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const colorSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.7 1.8-1.6 0-.5-.2-.9-.4-1.2-.2-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16.5A4.5 4.5 0 0 0 21 11c0-4.4-4-8-9-8z" fill="#fff8e6" stroke="#174f86" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.4" fill="#e02424"/><circle cx="10.2" cy="7.5" r="1.4" fill="#f5b700"/><circle cx="14.5" cy="7.5" r="1.4" fill="#159447"/><circle cx="17.2" cy="11" r="1.4" fill="#1d6fd6"/></svg>`;
  const routeSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H13a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h4.5"/></svg>`;
  const dragSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const plusSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  const persist = async () => {
    cats = await allCategoriesSorted();
    order = order.filter((id, i, a) => cats.some((c) => c.id === id) && a.indexOf(id) === i);
    const existing = await getAll("storeCategoryRoutes"), tx = state.db.transaction("storeCategoryRoutes", "readwrite"), os = tx.objectStore("storeCategoryRoutes");
    for (const r of existing) if (r.storeId === storeId) os.delete(r.id);
    order.forEach((id, i) => os.put({ id: uuid(), storeId, categoryId: id, position: i + 1, needsPositioning: false }));
    await txDone(tx);
  };
  const refreshStoreCount = async () => {
  };
  const getManageScroll = () => {
    const m = $("#modalRoot .modal"), b = $("#modalBackdrop");
    return { m: m ? m.scrollTop : 0, b: b ? b.scrollTop : 0 };
  };
  const paint = (targetScroll = null) => {
    const scrollBefore = targetScroll || getManageScroll();
    const selected = new Set(order), used = order.map((id) => cats.find((c) => c.id === id)).filter(Boolean), other = cats.filter((c) => !selected.has(c.id));
    const content = $("#manageCategoryContent");
    if (!content) return;
    content.innerHTML = `
    <div class="category-section-head route-section-head"><span class="route-title-with-ico"><span class="route-title-ico" aria-hidden="true">${routeSvg}</span><strong>Percorso di Spesa (${used.length})</strong></span><div class="route-head-actions"><button type="button" class="header-icon copy-mini" id="copyRouteBtn" aria-label="Copia configurazione da altro supermercato" title="Copia configurazione">${copySvg}</button><button type="button" class="header-icon trash-mini" id="removeAllStoreCategories" ${used.length ? "" : "disabled"} aria-label="Rimuovi tutti i reparti dal percorso" title="Rimuovi tutti i reparti dal percorso">${TRASH_OFFICE}</button></div></div>
    <div id="usedCategoryList">${used.map((c) => swipeWrap(`<div class="route-row" data-route="${c.id}"><span class="route-name">${esc(c.name)}</span><button type="button" class="route-drag-handle" data-drag-handle aria-label="Trascina ${esc(c.name)} per cambiare posizione" title="Trascina per ordinare">${dragSvg}</button></div>`, "swipe-route")).join("") || '<div class="empty route-empty">Inizia ad aggiungere reparti e ordinali<br>secondo il percorso di spesa.</div>'}</div>
    <div class="category-section-head"><strong>Reparti disponibili (${other.length})</strong><button type="button" class="btn btn-primary btn-small" id="addAllStoreCategories" ${other.length ? "" : "disabled"}>Aggiungi tutti</button></div>
    <div id="unusedCategoryList">${other.map((c) => `<div class="route-row route-row-unselected"><span class="route-name">${esc(c.name)}</span><button type="button" class="circle-add" data-add-store-cat="${c.id}" aria-label="Aggiungi ${esc(c.name)} a questo supermercato" title="Aggiungi reparto">${plusSvg}</button></div>`).join("") || '<div class="empty">Tutti i reparti sono gi\xE0 utilizzati.</div>'}</div><button type="button" class="btn btn-primary btn-block" id="newStoreCategoryBtn" style="margin-top:10px">+ Nuovo Reparto</button>`;
    const copyBtn = $("#copyRouteBtn");
    if (copyBtn) copyBtn.onclick = () => {
      const prevScroll = getManageScroll();
      const refreshOrder = async () => {
        const latest = (await getAll("storeCategoryRoutes")).filter((r) => r.storeId === storeId).sort((a, b) => a.position - b.position);
        order = latest.map((r) => r.categoryId).filter((id, i, a) => cats.some((c) => c.id === id) && a.indexOf(id) === i);
      };
      openCopyRoute(storeId, async () => {
        await refreshOrder();
        await showManageModal(prevScroll);
      }, async () => {
        await refreshOrder();
        paint(getManageScroll());
      });
    };
    const delAll = $("#removeAllStoreCategories");
    if (delAll) delAll.onclick = async () => {
      if (!order.length) return;
      const prevScroll = getManageScroll();
      const yes = await confirmDialog("Rimuovi tutti i reparti dal percorso", `Vuoi rimuovere tutti i reparti dal percorso di \u201C${esc(s.name)}\u201D?<br>I reparti non verranno comunque rimossi dal database.`, "Rimuovi tutti", { closeButton: false, backdropClose: false, overlay: true });
      if (yes) {
        order = [];
        await persist();
        paint(prevScroll);
        showToast("Reparti rimossi dal percorso");
      }
    };
    $("#newStoreCategoryBtn").onclick = () => {
      const prevScroll = getManageScroll();
      openNewCategoryWindow(async () => {
        cats = await allCategoriesSorted();
        await showManageModal(prevScroll);
      }, { keepModalOnClose: true });
    };
    const addAll = $("#addAllStoreCategories");
    if (addAll) addAll.onclick = async () => {
      const prevScroll = getManageScroll();
      for (const c of other) if (!order.includes(c.id)) order.push(c.id);
      await persist();
      paint(prevScroll);
      await refreshStoreCount();
      showToast("Tutti i reparti sono stati aggiunti");
    };
    bindSwipeDelete($("#usedCategoryList"), "[data-route]", async (row) => {
      const prevScroll = getManageScroll();
      const id = row.dataset.route;
      const prevOrder = [...order];
      order = order.filter((x) => x !== id);
      await persist();
      paint(prevScroll);
      await refreshStoreCount();
      showUndoToast("Reparto rimosso dal percorso", async () => {
        order = prevOrder;
        await persist();
        if ($("#manageCategoryContent")) paint(prevScroll);
        else if (state.page === "stores") await renderStores();
      });
    });
    content.querySelectorAll("[data-add-store-cat]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const prevScroll = getManageScroll();
      const id = b.dataset.addStoreCat;
      if (!order.includes(id)) order.push(id);
      await persist();
      paint(prevScroll);
      await refreshStoreCount();
    }));
    const list = $("#usedCategoryList");
    if (list) bindCategoryDrag(list, async (next) => {
      order = next.filter((id) => cats.some((c) => c.id === id));
      await persist();
      paint();
      await refreshStoreCount();
    });
    if (scrollBefore && (scrollBefore.m > 0 || scrollBefore.b > 0)) {
      const apply = () => {
        const m = $("#modalRoot .modal"), bd = $("#modalBackdrop");
        if (m && scrollBefore.m) m.scrollTop = scrollBefore.m;
        if (bd && scrollBefore.b) bd.scrollTop = scrollBefore.b;
      };
      apply();
      requestAnimationFrame(apply);
    }
    refreshStoreCount();
  };
  const openStoreColorModal = (previewText, prevScroll) => {
    const renderHexRows = (rows) => rows.map((row) => `<div class="cp-hex-row">${row.map((hex) => `<button type="button" class="cp-hex" data-cp-hex="${hex}" style="--hex-c:${hex}" aria-label="Colore ${hex}" title="${hex}"><span class="cp-hex-fill"></span></button>`).join("")}</div>`).join("");
    const hexToRgb = (hex) => {
      const h = normHex6(hex);
      if (!h) return null;
      const n = parseInt(h.slice(1), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const rgbToHex = (r, g, b) => {
      const cl = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
      return `#${[cl(r), cl(g), cl(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    };
    let draftBg = normHex6(s.bgColor);
    let draftText = normHex6(s.textColor);
    let activeTab = "bg";
    const body = `<div class="color-picker-modal">
      <div class="cp-preview-card">
        <span class="cp-preview-sample" id="cpPreviewSample">${esc(previewText)}</span>
        <span class="cp-preview-meta" id="cpPreviewMeta"></span>
      </div>
      <div class="cp-multipage">
        <div class="cp-tabs" role="tablist" aria-label="Seleziona elemento da colorare">
          <button type="button" class="cp-tab active" role="tab" aria-selected="true" data-cp-tab="bg"><span class="cp-tab-dot" id="cpTabBgDot"></span><span>Sfondo</span></button>
          <button type="button" class="cp-tab" role="tab" aria-selected="false" data-cp-tab="text"><span class="cp-tab-dot" id="cpTabTextDot">A</span><span>Testo</span></button>
        </div>
        <div class="cp-multipage-body" role="tabpanel">
          <button type="button" class="cp-default-btn" id="cpDefaultBtn"></button>
          <div class="cp-hex-palette" id="cpPalette">
            <div class="cp-hex-chromatic">${renderHexRows(HEX_CHROMATIC_ROWS)}</div>
            <div class="cp-hex-gray">${renderHexRows(HEX_GRAY_ROWS)}</div>
          </div>
          <div class="cp-custom-box">
            <div class="cp-custom-head">Colore personalizzato (RGB / Hex)</div>
            <div class="cp-inputs-row">
              <div class="cp-in-col"><label for="cpInR">R</label><input id="cpInR" type="number" inputmode="numeric" min="0" max="255" placeholder="0"></div>
              <div class="cp-in-col"><label for="cpInG">G</label><input id="cpInG" type="number" inputmode="numeric" min="0" max="255" placeholder="0"></div>
              <div class="cp-in-col"><label for="cpInB">B</label><input id="cpInB" type="number" inputmode="numeric" min="0" max="255" placeholder="0"></div>
              <div class="cp-in-col is-hex"><label for="cpInHex">Hex</label><input id="cpInHex" type="text" maxlength="7" autocomplete="off" autocapitalize="characters" placeholder="#000000"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    modal("Colori supermercato", body, [
      { label: "Annulla", class: "btn-plain", action: async () => {
        state.currentModal = null;
        state.currentModalKeep = false;
        await showManageModal(prevScroll);
      } },
      { label: "Applica", class: "btn-primary", action: async () => {
        s.bgColor = draftBg;
        s.textColor = draftText;
        s.updatedAt = now();
        await putOne("stores", s);
        state.currentModal = null;
        state.currentModalKeep = false;
        await showManageModal(prevScroll);
      } }
    ], { closeButton: false, backdropClose: false, alignTop: true, themed: true, keepModalOnClose: true, onClose: () => showManageModal(prevScroll) });

    const sampleEl = $("#cpPreviewSample"), metaEl = $("#cpPreviewMeta");
    const bgDot = $("#cpTabBgDot"), textDot = $("#cpTabTextDot");
    const defBtn = $("#cpDefaultBtn");
    const inR = $("#cpInR"), inG = $("#cpInG"), inB = $("#cpInB"), inHex = $("#cpInHex");
    const curVal = () => activeTab === "bg" ? draftBg : draftText;
    const setCurVal = (hex) => {
      if (activeTab === "bg") draftBg = hex;
      else draftText = hex;
    };
    const renderColorUI = (skipInputs = false) => {
      const effText = draftText || autoTextColor(draftBg);
      if (sampleEl) {
        sampleEl.style.backgroundColor = draftBg || "transparent";
        sampleEl.style.color = effText;
        sampleEl.style.boxShadow = draftBg ? "inset 0 0 0 1px rgba(0,0,0,.12)" : "none";
      }
      if (metaEl) metaEl.textContent = (!draftBg && !draftText) ? "Predefinito" : (activeTab === "bg" ? (draftBg || "Nessun riempimento") : (draftText || "Automatico"));
      if (bgDot) {
        bgDot.classList.toggle("is-none", !draftBg);
        bgDot.style.backgroundColor = draftBg || "#ffffff";
      }
      if (textDot) {
        textDot.style.backgroundColor = draftBg || "#f2f6f4";
        textDot.style.color = effText;
      }
      document.querySelectorAll("[data-cp-tab]").forEach((t) => {
        const isAct = t.dataset.cpTab === activeTab;
        t.classList.toggle("active", isAct);
        t.setAttribute("aria-selected", String(isAct));
      });
      const activeHex = curVal();
      if (defBtn) {
        defBtn.classList.toggle("active", activeHex === null);
        defBtn.textContent = activeTab === "bg" ? "Nessun riempimento" : "Automatico";
      }
      let inPalette = false;
      document.querySelectorAll(".cp-hex").forEach((sw) => {
        const hit = activeHex !== null && sw.dataset.cpHex === activeHex;
        if (hit) inPalette = true;
        sw.classList.toggle("active", hit);
      });
      document.querySelector(".cp-custom-box")?.classList.toggle("active", activeHex !== null && !inPalette);
      const shownHex = activeHex || (activeTab === "bg" ? "#FFFFFF" : effText);
      if (!skipInputs) {
        const rgb = hexToRgb(shownHex) || { r: 23, g: 33, b: 30 };
        if (inR) inR.value = String(rgb.r);
        if (inG) inG.value = String(rgb.g);
        if (inB) inB.value = String(rgb.b);
        if (inHex) inHex.value = shownHex;
      }
    };
    document.querySelectorAll("[data-cp-tab]").forEach((t) => t.addEventListener("click", () => {
      activeTab = t.dataset.cpTab;
      renderColorUI();
    }));
    defBtn?.addEventListener("click", () => {
      setCurVal(null);
      renderColorUI();
    });
    document.querySelectorAll(".cp-hex").forEach((sw) => sw.addEventListener("click", () => {
      setCurVal(sw.dataset.cpHex);
      renderColorUI();
    }));
    const onRgbInput = () => {
      const rawR = inR.value.trim(), rawG = inG.value.trim(), rawB = inB.value.trim();
      if (rawR === "" || rawG === "" || rawB === "") return;
      const r = Number(rawR), g = Number(rawG), b = Number(rawB);
      if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return;
      const hex = rgbToHex(r, g, b);
      setCurVal(hex);
      if (inHex) inHex.value = hex;
      renderColorUI(true);
    };
    [inR, inG, inB].forEach((el) => {
      selectAllOnFocus(el);
      el.addEventListener("input", onRgbInput);
      el.addEventListener("blur", () => {
        const cur = Math.max(0, Math.min(255, Math.round(Number(el.value) || 0)));
        el.value = String(cur);
        onRgbInput();
      });
    });
    if (inHex) {
      selectAllOnFocus(inHex);
      inHex.addEventListener("input", () => {
        const parsed = normHex6(inHex.value);
        if (!parsed) return;
        setCurVal(parsed);
        const rgb = hexToRgb(parsed);
        if (rgb) {
          inR.value = String(rgb.r);
          inG.value = String(rgb.g);
          inB.value = String(rgb.b);
        }
        renderColorUI(true);
      });
      inHex.addEventListener("blur", () => {
        const parsed = normHex6(inHex.value);
        if (parsed) {
          inHex.value = parsed;
        } else {
          renderColorUI();
        }
      });
    }
    renderColorUI();
  };
  const showManageModal = async (savedScroll = null) => {
    const st = await settings(), allStores = await allStoresSorted();
    const body = `<div class="store-name-sticky"><div class="field" style="margin:0 0 6px"><label for="storeNameInput">Nome <span class="label-hint">(max 20 caratteri)</span></label></div><div class="name-copy-row"><div class="field" style="flex:1;min-width:0;margin:0"><div class="name-box"><input id="storeNameInput" type="text" maxlength="20" value="${esc(s.name)}" autocomplete="off"><button type="button" class="name-no" id="storeNameNo" aria-label="Annulla modifica nome" title="Ripristina il nome precedente">${SVG_X}</button><button type="button" class="name-ok" id="storeNameOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button></div></div><button type="button" class="btn btn-secondary copy-icon-btn store-color-icon-btn" id="storeColorBtn" aria-label="Personalizza colori supermercato" title="Colori supermercato">${colorSvg}</button></div></div>
    <div id="manageCategoryContent"></div>`;
    modal("Configurazione supermercato", body, [], { closeButton: true, backdropClose: false, alignTop: true, themed: true, onClose: () => {
      if (state.page === "stores") renderStores();
    } });
    {
      const h = $("#modalRoot .modal-header");
      h.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
      h.insertAdjacentHTML("afterend", '<div class="info-pop" hidden>Personalizza i colori di identificazione del supermercato, aggiungi i reparti che utilizzi e trascinali per ordinarli secondo il tuo percorso di spesa.</div>');
    }
    const nameIn = $("#storeNameInput"), nbox = nameIn.closest(".name-box");
    const syncNamePreview = () => {
      const hasColors = storeHasColors(s);
      nameIn.classList.toggle("has-store-colors", hasColors);
      nameIn.classList.toggle("has-store-bg", !!s.bgColor);
      if (s.bgColor) {
        nameIn.style.backgroundImage = "none";
        nameIn.style.backgroundColor = s.bgColor;
      } else {
        nameIn.style.backgroundImage = "";
        nameIn.style.backgroundColor = "";
      }
      nameIn.style.color = s.textColor || (s.bgColor ? autoTextColor(s.bgColor) : (hasColors ? "#000000" : ""));
    };
    syncNamePreview();
    $("#storeColorBtn")?.addEventListener("click", () => {
      const prevScroll = getManageScroll();
      openStoreColorModal(nameIn.value.trim() || s.name, prevScroll);
    });
    const updName = () => {
      nbox.classList.toggle("dirty", nameIn.value.trim() !== s.name);
    };
    nameIn.addEventListener("input", updName);
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("#storeNameOk").click();
      }
    });
    $("#storeNameOk").addEventListener("click", async () => {
      const name = nameIn.value.trim();
      if (!name) {
        showToast("Inserisci il nome del supermercato.");
        return;
      }
      if (name.length > 20) {
        showToast("Il nome del supermercato pu\xF2 contenere al massimo 20 caratteri.");
        return;
      }
      if (name === s.name) {
        nameIn.blur();
        return;
      }
      if ((await getAll("stores")).some((x) => x.id !== storeId && x.nameNormalized === norm(name))) {
        showToast("Esiste gi\xE0 un supermercato con questo nome.");
        return;
      }
      s.name = name;
      s.nameNormalized = norm(name);
      s.updatedAt = now();
      await putOne("stores", s);
      nameIn.blur();
      updName();
      showToast("Nome aggiornato");
    });
    $("#storeNameNo").addEventListener("click", () => {
      nameIn.value = s.name;
      updName();
      nameIn.blur();
    });
    paint(savedScroll);
    if (savedScroll && (savedScroll.m > 0 || savedScroll.b > 0)) {
      const apply = () => {
        const m = $("#modalRoot .modal"), bd = $("#modalBackdrop");
        if (m && savedScroll.m) m.scrollTop = savedScroll.m;
        if (bd && savedScroll.b) bd.scrollTop = savedScroll.b;
      };
      apply();
      requestAnimationFrame(apply);
      setTimeout(apply, 25);
      setTimeout(apply, 80);
    }
  };
  await showManageModal();
}

export async function openCopyRoute(storeId, returnToManage = () => openManageCategories(storeId), onUndoManage = null) {
  const [allSs, routes] = await Promise.all([allStoresSorted(), getAll("storeCategoryRoutes")]);
  const ss = allSs.filter((s) => s.id !== storeId).map((x) => {
    const n = routes.filter((r) => r.storeId === x.id).length;
    const countHtml = `<span style="font-size:13px;font-weight:400">&nbsp;&nbsp;&nbsp;(${n} ${n === 1 ? "reparto" : "reparti"})</span>`;
    const baseHtml = storeHasColors(x) ? storeChipHtml(x) : esc(x.name);
    return { ...x, labelHtml: `<span>${baseHtml}${countHtml}</span>` };
  });
  if (!ss.length) {
    showToast("Non ci sono altri supermercati da cui copiare.");
    return;
  }
  modal("Copia configurazione da altro supermercato", `<div class="field" style="margin-bottom:28px"><span class="small muted">Verranno copiati sia i reparti sia il percorso di spesa dal supermercato selezionato.</span>${customDropdown("copyRouteStore", ss[0]?.id, ss, false, true)}</div>`, [
    { label: "Copia", class: "btn-primary", action: async () => {
      const source = $("#copyRouteStore").value, routes = await getAll("storeCategoryRoutes"), chosen = routes.filter((r) => r.storeId === source).sort((a, b) => a.position - b.position);
      if (routes.some((r) => r.storeId === storeId) && !await confirmDialog("Copia configurazione", "La nuova configurazione sostituir\xE0 quella esistente. Continuare?", "Continua", { closeButton: true, keepModalOnClose: true, keepOnConfirm: true, onClose: returnToManage })) return;
      const prevRoutes = routes.filter((r) => r.storeId === storeId).map((r) => ({ ...r }));
      const tx = state.db.transaction("storeCategoryRoutes", "readwrite"), os = tx.objectStore("storeCategoryRoutes");
      for (const r of routes) if (r.storeId === storeId) os.delete(r.id);
      chosen.forEach((r, i) => os.put({ id: uuid(), storeId, categoryId: r.categoryId, position: i + 1, needsPositioning: false }));
      await txDone(tx);
      state.currentModal = null;
      state.currentModalKeep = false;
      await returnToManage();
      showUndoToast("Configurazione copiata", async () => {
        const curRoutes = await getAll("storeCategoryRoutes");
        const undoTx = state.db.transaction("storeCategoryRoutes", "readwrite"), undoOs = undoTx.objectStore("storeCategoryRoutes");
        for (const r of curRoutes) if (r.storeId === storeId) undoOs.delete(r.id);
        for (const r of prevRoutes) undoOs.put(r);
        await txDone(undoTx);
        if ($("#manageCategoryContent") && typeof onUndoManage === "function") await onUndoManage();
        else if (state.page === "stores") await renderStores();
      });
    } },
    { label: "Annulla", class: "btn-plain", action: async () => {
      state.currentModal = null;
      state.currentModalKeep = false;
      await returnToManage();
    } }
  ], { closeButton: false, backdropClose: false, keepModalOnClose: true, onClose: returnToManage, alignTop: true, themed: true });
  wireCustomDropdown("copyRouteStore");
}

export async function deleteStore(storeId) {
  const [routes, associations, prices, items, st] = await Promise.all([getAll("storeCategoryRoutes"), getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems"), getOne("settings", "main")]);
  const tx = state.db.transaction(["stores", "storeCategoryRoutes", "productStores", "productPrices", "shoppingListItems", "settings", "tombstones"], "readwrite");
  for (const x of routes) if (x.storeId === storeId) tx.objectStore("storeCategoryRoutes").delete(x.id);
  for (const x of associations) if (x.storeId === storeId) tx.objectStore("productStores").delete(x.id);
  for (const x of prices) if (x.storeId === storeId) tx.objectStore("productPrices").delete(x.id);
  for (const x of items) if (x.storeId === storeId) {
    x.storeId = null;
    x.updatedAt = now();
    tx.objectStore("shoppingListItems").put(x);
  }
  if (st?.defaultStoreId === storeId) tx.objectStore("settings").put({ ...st, defaultStoreId: null });
  tx.objectStore("stores").delete(storeId);
  tx.objectStore("tombstones").put({ id: uuid(), entityType: "store", entityId: storeId, deletedAt: now(), revision: Date.now() });
  await txDone(tx);
  state.selectedStore = "all";
  state.selectedStores = ["all"];
  localStorage.setItem("spesaSuMisura.selectedStores", JSON.stringify(state.selectedStores));
  renderStores();
  showToast("Supermercato eliminato");
}
