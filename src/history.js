// Storico liste salvate, guida/informazioni e backup/ripristino dati
import { state } from "./state.js";
import { APP_NAME, APP_VERSION, GUIDE_HTML, MAX_SAVED_LISTS, PENCIL_SVG, SVG_CHK, SVG_X, TRASH_OFFICE, infoBtn, stores } from "./data.js";
import { $, canonicalSavedItem, esc, norm, now, uuid } from "./calculations.js";
import { activeItems, activeList, allData, delOne, getAll, getOne, putOne, replaceItems, settings, snapshotItems, txDone } from "./storage.js";
import { bindSwipeDelete, closeModal, confirmDialog, modal, releaseModalKeyboard, showToast, showUndoToast, swipeWrap } from "./ui.js";
import { openListMenu, renderList } from "./shoppingList.js";
import { render } from "./router.js";

export async function currentSavedListId() {
  const cur = await settings(), id = cur.currentSavedListId;
  return id && await getOne("savedLists", id) ? id : null;
}

export async function setCurrentSavedList(id) {
  const cur = await settings();
  await putOne("settings", { ...cur, currentSavedListId: id });
}

export async function listItemsForSave() {
  return (await activeItems()).map((i) => ({ productId: i.productId, storeId: i.storeId || null, quantity: i.quantity, manualAmountMinor: i.manualAmountMinor ?? null, manualUnitPriceMinor: i.manualUnitPriceMinor ?? null }));
}

export function isSavedListModified(savedList, items, pMap, sMap) {
  if (!savedList) return false;
  const cur = items.map((i) => canonicalSavedItem(i, pMap, sMap)).filter(Boolean).sort();
  const ref = (savedList.items || []).map((i) => canonicalSavedItem(i, pMap, sMap)).filter(Boolean).sort();
  return cur.length !== ref.length || cur.some((v, idx) => v !== ref[idx]);
}

export async function saveListAs(name, existing) {
  const items = await listItemsForSave();
  const rec = existing ? { ...existing, name, nameNormalized: norm(name), items, updatedAt: now() } : { id: uuid(), name, nameNormalized: norm(name), items, createdAt: now(), updatedAt: now() };
  await putOne("savedLists", rec);
  await setCurrentSavedList(rec.id);
  return rec;
}

export async function loadSavedList(sl, opts = {}) {
  const clearPromos = !!opts.clearPromos;
  const prev = await snapshotItems(), prevCur = await currentSavedListId(), prods = new Set((await getAll("products")).map((x) => x.id)), sts = new Set((await getAll("stores")).map((x) => x.id)), l = await activeList();
  const items = sl.items.filter((i) => prods.has(i.productId)).map((i) => {
    const manualUnitPriceMinor = clearPromos ? null : (i.manualUnitPriceMinor ?? null);
    const manualAmountMinor = clearPromos ? null : (manualUnitPriceMinor !== null ? Math.round(manualUnitPriceMinor * i.quantity) : (i.manualAmountMinor ?? null));
    return { id: uuid(), listId: l.id, productId: i.productId, storeId: i.storeId && sts.has(i.storeId) ? i.storeId : null, quantity: i.quantity, manualAmountMinor, manualUnitPriceMinor, checked: false, createdAt: now(), updatedAt: now() };
  });
  await replaceItems(items);
  await setCurrentSavedList(sl.id);
  await renderList();
  showUndoToast("Lista caricata", async () => {
    await replaceItems(prev);
    await setCurrentSavedList(prevCur);
    await renderList();
  });
}

export async function openSavedListsWindow(mode) {
  const lists = (await getAll("savedLists")).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" })), curId = await currentSavedListId(), prods = new Set((await getAll("products")).map((x) => x.id));
  const save = mode === "save", cnt = (l) => l.items.filter((i) => prods.has(i.productId)).length;
  const rows = lists.map((l) => {
    const n = cnt(l), inUse = l.id === curId, dt = new Date(l.updatedAt || l.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    return swipeWrap(`<div class="list-row compact saved-row${inUse ? " is-inuse" : ""}" data-saved-row="${l.id}"><div class="saved-info"><div class="saved-title"><span class="row-name">${esc(l.name)}</span><button type="button" class="row-edit-inline" data-saved-ren="${l.id}" aria-label="Rinomina ${esc(l.name)}" title="Rinomina">${PENCIL_SVG}</button>${inUse ? '<span class="badge-inuse">IN USO</span>' : ""}</div><div class="row-sub">${n} ${n === 1 ? "articolo" : "articoli"} \u00B7 ${dt}</div></div></div>`, "swipe-compact");
  }).join("") || '<div class="empty">Nessuna lista salvata.</div>';
  const limitReached = lists.length >= MAX_SAVED_LISTS;
  const listIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>';
  const body = `<div class="saved-lists-sheet">${save ? `<div class="saved-name-card"><div class="field"><label for="savedListName">Nome della lista</label><div class="name-box"><input id="savedListName" type="text" maxlength="20" placeholder="Es. Spesa settimanale" autocomplete="off"><button type="button" class="name-no" id="savedListNameNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="savedListNameOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button></div></div>${limitReached ? `<div class="inline-note">Limite di ${MAX_SAVED_LISTS} liste salvate raggiunto: puoi sovrascriverne una esistente toccandola o eliminarne una.</div>` : ""}</div>` : ""}<div class="saved-list-section"><div class="saved-list-head"><div class="saved-list-head-left"><span class="saved-list-icon">${listIcon}</span><span class="saved-list-title">Elenco liste</span><span class="title-count-badge">${lists.length}</span>${limitReached ? '<span class="saved-full-badge" aria-label="Elenco liste pieno">FULL</span>' : ""}</div><button type="button" class="header-icon trash-mini" id="delAllSavedBtn" ${lists.length ? "" : "disabled"} aria-label="Elimina tutte le liste salvate" title="Elimina tutte le liste salvate">${TRASH_OFFICE}</button></div><div id="savedListsContainer">${rows}</div></div>${!save && lists.length ? `<label class="check-line saved-load-clear-promos"><input type="checkbox" id="clearPromosOnLoad"> <span>Rimuovi eventuali prezzi SCONTATI</span></label>` : ""}</div>`;
  let selId = null;
  const doSave = async () => {
    const name = $("#savedListName").value.trim();
    if (!name) {
      showToast("Inserisci il nome della lista.");
      return;
    }
    if (!(await listItemsForSave()).length) {
      showToast("La lista \xE8 vuota.");
      return;
    }
    const ex = lists.find((l) => norm(l.name) === norm(name));
    if (ex) {
      const yes = await confirmDialog("Sovrascrivi lista", `La lista \u201C${esc(ex.name)}\u201D esiste gi\xE0.<br>Vuoi sovrascriverla con la lista attuale?`, "Sovrascrivi", { closeButton: true, keepModalOnClose: true, onClose: () => openSavedListsWindow(mode) });
      if (!yes) return;
      await saveListAs(ex.name, ex);
    } else {
      if (lists.length >= MAX_SAVED_LISTS) {
        await confirmDialog(
          "Elenco liste pieno",
          `L\u2019Elenco liste \xE8 gi\xE0 pieno (${MAX_SAVED_LISTS} liste salvate) e non \xE8 possibile salvare altre liste.<br><br>Puoi comunque sovrascrivere una lista esistente selezionandola dall\u2019elenco, oppure eliminarne una.`,
          "OK",
          { overlay: true, singleButton: true, confirmClass: "btn-primary", themed: true, backdropClose: false }
        );
        return;
      }
      await saveListAs(name, null);
    }
    closeModal(false);
    await renderList();
    showToast("Lista salvata");
  };
  const doLoad = async () => {
    const l = lists.find((x) => x.id === selId);
    if (!l) return;
    const clearPromos = !!$("#clearPromosOnLoad")?.checked;
    closeModal(false);
    await loadSavedList(l, { clearPromos });
  };
  modal(save ? "Salva con nome" : "Carica lista", body, save ? [{ label: "Chiudi", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openListMenu(); } }, { label: "Salva", class: "btn-primary", action: doSave }] : [{ label: "Chiudi", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openListMenu(); } }, { label: "Carica", class: "btn-primary", action: doLoad }], { closeButton: true, backdropClose: false, alignTop: true, keepModalOnClose: true, themed: true, onClose: () => openListMenu() });
  {
    const hh = $("#modalRoot .modal-header");
    hh.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    const infoTxt = save
      ? "Scrivi un nome (o seleziona una lista esistente per sovrascriverla) e premi Salva.<br>Per eliminare una singola lista, scorri il relativo riquadro verso destra."
      : "Seleziona una lista dall\u2019elenco.<br>Per eliminare una singola lista, scorri il relativo riquadro verso destra.";
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>${infoTxt}</div>`);
  }
  const root = $("#modalRoot");
  let savedNameConfirmed = "";
  const savedNameInp = $("#savedListName");
  const savedNameBox = savedNameInp?.closest(".name-box");
  const updSavedNameBox = () => {
    if (!savedNameInp || !savedNameBox) return;
    const v = savedNameInp.value.trim();
    savedNameBox.classList.toggle("dirty", !!v && v !== savedNameConfirmed);
  };
  if (savedNameInp && savedNameBox) {
    savedNameInp.addEventListener("focus", () => {
      savedNameConfirmed = "";
      updSavedNameBox();
    });
    savedNameInp.addEventListener("click", () => {
      savedNameConfirmed = "";
      updSavedNameBox();
    });
    savedNameInp.addEventListener("input", () => {
      savedNameConfirmed = "";
      updSavedNameBox();
    });
    $("#savedListNameNo")?.addEventListener("mousedown", (e) => e.preventDefault());
    $("#savedListNameNo")?.addEventListener("click", () => {
      savedNameInp.value = "";
      savedNameConfirmed = "";
      updSavedNameBox();
      savedNameInp.blur();
    });
    $("#savedListNameOk")?.addEventListener("mousedown", (e) => e.preventDefault());
    const confirmSavedName = () => {
      const v = savedNameInp.value.trim();
      if (!v) {
        showToast("Inserisci il nome della lista.");
        savedNameInp.focus();
        return;
      }
      savedNameConfirmed = v;
      updSavedNameBox();
      savedNameInp.blur();
      releaseModalKeyboard();
    };
    $("#savedListNameOk")?.addEventListener("click", confirmSavedName);
    savedNameInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        confirmSavedName();
      }
    });
  }
  const loadBtn = [...root.querySelectorAll("[data-modal-action]")].find((b) => b.textContent.trim() === "Carica");
  if (loadBtn) loadBtn.disabled = true;
  root.querySelectorAll("[data-saved-row]").forEach((r) => r.addEventListener("click", (e) => {
    if (e.target.closest("[data-saved-ren]")) return;
    const l = lists.find((x) => x.id === r.dataset.savedRow);
    if (save) {
      $("#savedListName").value = l.name;
      savedNameConfirmed = l.name;
      updSavedNameBox();
    } else {
      selId = l.id;
      root.querySelectorAll("[data-saved-row]").forEach((x) => x.classList.toggle("is-saved-selected", x.dataset.savedRow === selId));
      if (loadBtn) loadBtn.disabled = false;
    }
  }));
  bindSwipeDelete($("#savedListsContainer"), "[data-saved-row]", async (row) => {
    const l = lists.find((x) => x.id === row.dataset.savedRow);
    if (!l) return false;
    const yes = await confirmDialog("Elimina lista", `La lista \u201C${esc(l.name)}\u201D verr\xE0 rimossa definitivamente. Procedere comunque?`, "Elimina", { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openSavedListsWindow(mode) });
    if (!yes) return false;
    const wasCurrent = l.id === curId;
    await delOne("savedLists", l.id);
    if (wasCurrent) await setCurrentSavedList(null);
    await openSavedListsWindow(mode);
    if (state.page === "list") await renderList();
    showToast("Lista eliminata");
  });
  $("#delAllSavedBtn").addEventListener("click", async () => {
    if (!lists.length) return;
    const yes = await confirmDialog("Elimina tutte le liste", "Tutte le liste salvate verranno rimosse definitivamente. Procedere comunque?", "Elimina tutte", { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openSavedListsWindow(mode) });
    if (yes) {
      for (const l of lists) await delOne("savedLists", l.id);
      await openSavedListsWindow(mode);
      await renderList();
      showToast("Liste eliminate");
    }
  });
  root.querySelectorAll("[data-saved-ren]").forEach((b) => b.addEventListener("click", () => {
    const l = lists.find((x) => x.id === b.dataset.savedRen);
    modal("Rinomina lista", `<div class="field" style="margin-bottom:28px"><label for="savedRenameInput">Nome</label><div class="name-box"><input id="savedRenameInput" type="text" maxlength="20" value="${esc(l.name)}" autocomplete="off"><button type="button" class="name-no" id="savedRenameNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="savedRenameOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button></div></div>`, [
      { label: "Annulla", class: "btn-plain", action: () => closeModal() },
      { label: "OK", class: "btn-primary", action: async () => {
        const name = $("#savedRenameInput").value.trim();
        if (!name) {
          showToast("Inserisci il nome della lista.");
          return;
        }
        if (lists.some((x) => x.id !== l.id && norm(x.name) === norm(name))) {
          showToast("Esiste gi\xE0 una lista con questo nome.");
          return;
        }
        await putOne("savedLists", { ...l, name, nameNormalized: norm(name), updatedAt: now() });
        state.currentModal = null;
        state.currentModalKeep = false;
        await openSavedListsWindow(mode);
        await renderList();
        showToast("Nome aggiornato");
      } }
    ], { closeButton: false, backdropClose: false, alignTop: true, keepModalOnClose: true, onClose: () => openSavedListsWindow(mode) });
    const renInp = $("#savedRenameInput");
    const renBox = renInp?.closest(".name-box");
    const showRenIcons = () => renBox?.classList.add("dirty");
    if (renInp && renBox) {
      renInp.addEventListener("focus", showRenIcons);
      renInp.addEventListener("click", showRenIcons);
      renInp.addEventListener("input", showRenIcons);
      $("#savedRenameNo")?.addEventListener("mousedown", (e) => e.preventDefault());
      $("#savedRenameNo")?.addEventListener("click", () => {
        renInp.value = l.name;
        renBox.classList.remove("dirty");
        renInp.blur();
      });
      $("#savedRenameOk")?.addEventListener("mousedown", (e) => e.preventDefault());
      const confirmRename = () => {
        const v = renInp.value.trim();
        if (!v) {
          showToast("Inserisci il nome della lista.");
          renInp.focus();
          return;
        }
        renBox.classList.remove("dirty");
        renInp.blur();
        releaseModalKeyboard();
      };
      $("#savedRenameOk")?.addEventListener("click", confirmRename);
      renInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          confirmRename();
        }
      });
    }
  }));
}

export async function renderOther() {
  $("#appMain").innerHTML = `<h1>Altro</h1><button class="other-opt" id="guideBtn"><span class="row-name">Guida</span><div class="row-sub">Come usare SpesaSuMisura</div></button><button class="other-opt" id="infoBtn"><span class="row-name">Informazioni</span><div class="row-sub">Versione ${APP_VERSION}</div></button>`;
  $("#guideBtn").onclick = () => modal("Guida", GUIDE_HTML, [{ label: "Chiudi", class: "btn-primary", action: closeModal }], { closeButton: true, backdropClose: false });
  $("#infoBtn").onclick = () => modal("Informazioni", `<div class="info-about-modal" style="text-align:center;padding:12px"><div style="font-size:26px;font-weight:900">${APP_NAME}</div><p class="muted">La tua spesa, come la vuoi tu.</p><p>Versione ${APP_VERSION}</p><p class="small muted">I dati sono salvati localmente su questo dispositivo.</p></div>`, [], { closeButton: true, backdropClose: false });
}

export async function exportBackup(options = {}) {
  const data = await allData(), payload = { format: "personal-shopping-assistant", formatVersion: 1, appVersion: APP_VERSION, archiveId: (await getOne("meta", "archiveId"))?.value || uuid(), exportedAt: now(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const defaultName = options.suggestedName || `spesasumisura-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: defaultName, types: [{ description: "Backup SpesaSuMisura (JSON)", accept: { "application/json": [".json"] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast("Salvataggio eseguito");
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false;
      showToast("Impossibile salvare il backup: " + (e?.message || "errore sconosciuto"));
      return false;
    }
  }
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    modal(options.title || "Salva backup con nome", `<p>Scegli il nome con cui salvare il backup dei tuoi dati.</p><div class="field"><label for="backupFileName">Nome del file</label><input id="backupFileName" type="text" maxlength="120" value="${esc(defaultName)}" autocomplete="off"></div><p class="small muted">Il browser gestisce la destinazione del download. Nei browser che non consentono l'accesso diretto ai file, l'app non pu\xF2 garantire la sovrascrittura di un file gi\xE0 esistente.</p>`, [
      { label: "Annulla", class: "btn-plain", action: () => {
        closeModal(false);
        finish(false);
      } },
      { label: "Salva", class: "btn-primary", action: async () => {
        let fileName = $("#backupFileName").value.trim().replace(/[\\/:*?"<>|]/g, "-");
        if (!fileName) {
          showToast("Inserisci il nome del file.");
          return;
        }
        if (!/\.json$/i.test(fileName)) fileName += ".json";
        try {
          const url = URL.createObjectURL(blob), a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
          closeModal(false);
          showToast("Salvataggio eseguito");
          finish(true);
        } catch (e) {
          closeModal(false);
          showToast("Impossibile scaricare il backup: " + (e?.message || "errore sconosciuto"));
          finish(false);
        }
      } }
    ], { closeButton: true, onClose: () => finish(false), alignTop: true });
  });
}

export async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== "personal-shopping-assistant" || payload.formatVersion !== 1 || !payload.data) throw new Error("Formato backup non riconosciuto.");
    if (!Array.isArray(payload.data.savedLists)) payload.data.savedLists = [];
    if (!Array.isArray(payload.data.archivedReceipts)) payload.data.archivedReceipts = [];
    for (const name of stores) {
      if (!Array.isArray(payload.data[name])) throw new Error("Il backup non contiene tutti gli archivi richiesti.");
    }
    const d = payload.data, counts = `<ul><li>${d.products.length} articoli</li><li>${d.stores.length} supermercati</li><li>${d.shoppingListItems.length} articoli nella lista</li></ul>`;
    const tx = state.db.transaction(stores, "readwrite");
    for (const name of stores) {
      const os = tx.objectStore(name);
      os.clear();
      for (const item of d[name]) os.put(item);
    }
    await txDone(tx);
    state.selectedStore = "all";
    state.selectedStores = ["all"];
    state.pageStack = [];
    localStorage.setItem("spesaSuMisura.selectedStores", JSON.stringify(state.selectedStores));
    state.page = "list";
    state.listScrollY = 0;
    state.restoreListScroll = false;
    window.scrollTo({ top: 0, behavior: "auto" });
    render();
    showToast("Backup ripristinato");
  } catch (e) {
    showToast("Impossibile importare il backup: " + e.message);
  }
}
