// Gestione reparti (categorie) e associazione articoli
import { state } from "./state.js";
import { SVG_CHK, SVG_CIRCLED_PLUS, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, displayUnit, esc, filterBySearch, norm, now, productDisplayParts, productSearchText, uuid } from "./calculations.js";
import { allCategoriesSorted, allProductsSorted, categoryMap, getAll, getOne, putOne, txDone } from "./storage.js";
import { attachSearchClear, bindSwipeDelete, closeModal, confirmDialog, decorateInput, forceUppercaseInput, infoPop, modal, releaseModalKeyboard, showToast, showUndoToast, swipeWrap, updateNav } from "./ui.js";
import { openProductForm } from "./products.js";
import { countArchivedReceiptsForCategory, deleteStaleTombstonesInTx, findOrphanCategoryMatch, prepareFrozenReceiptsForCategoryDelete, promptArchiveRelink, unifyOrphanCategoryIdsInTx } from "./archive.js";

export async function renderCategories() {
  state.page = "categories";
  updateNav();
  $("#listFooter").classList.add("hidden");
  const [cats, products] = await Promise.all([allCategoriesSorted(), getAll("products")]);
  const counts = {};
  for (const pr of products) if (pr.categoryId) counts[pr.categoryId] = (counts[pr.categoryId] || 0) + 1;
  $("#appMain").innerHTML = `<div class="toolbar"><div class="title-row"><h1>Reparti</h1><span class="title-count-badge" id="catsCount">${cats.length}</span>${infoBtn}</div><button type="button" class="header-icon trash-mini" id="delAllCatsBtn" aria-label="Elimina tutti i reparti" title="Elimina tutti i reparti">${TRASH_OFFICE}</button></div>${infoPop("Crea e gestisci il database dei tuoi reparti.<br>Per eliminare un singolo reparto, scorri il relativo riquadro verso destra.<br>In ogni reparto andranno poi aggiunti i relativi articoli.")}<div class="sticky-action-wrap list-sticky-btn-wrap"><button class="btn btn-primary btn-block" id="newCategoryBtn">${SVG_CIRCLED_PLUS}<span>Crea un nuovo reparto</span></button></div><div class="products-search-sticky"><div class="search-wrap"><input type="search" class="search-input" id="catsSearch" maxlength="25" placeholder="Cerca reparto\u2026" aria-label="Cerca reparto" autocomplete="off" autocapitalize="characters"></div></div><div id="categoriesList"></div>`;
  const list = $("#categoriesList"), inp = $("#catsSearch"), d = $("#delAllCatsBtn");
  forceUppercaseInput(inp);
  const filteredCats = () => filterBySearch(cats, state.catsSearchQuery, (c) => c.name);
  const paint = () => {
    if (inp.value.length > 25) inp.value = inp.value.slice(0, 25);
    state.catsSearchQuery = inp.value;
    const filtered = filteredCats();
    const hasQuery = !!state.catsSearchQuery.trim();
    if (d) {
      d.disabled = !filtered.length;
      d.classList.toggle("dim", !filtered.length);
      const delLbl = hasQuery ? "Elimina i reparti filtrati" : "Elimina tutti i reparti";
      d.title = delLbl;
      d.setAttribute("aria-label", delLbl);
    }
    $("#catsCount").textContent = String(filtered.length);
    list.innerHTML = filtered.length ? filtered.map((c) => {
      const n = counts[c.id] || 0;
      return swipeWrap(`<div class="list-row compact" data-cat-delete="${c.id}"><button type="button" class="row-button" data-cat-edit="${c.id}"><span class="row-name">${esc(c.name)}</span><div class="row-sub">${n === 1 ? "1 articolo" : n + " articoli"}</div></button></div>`, "swipe-compact");
    }).join("") : `<div class="empty">${cats.length ? "Nessun reparto trovato." : "Non ci sono ancora reparti. Creane uno con il pulsante qui sopra."}</div>`;
    list.querySelectorAll("[data-cat-edit]").forEach((b) => b.addEventListener("click", () => openCategoryForm(b.dataset.catEdit)));
    bindSwipeDelete(list, "[data-cat-delete]", async (row) => {
      const id = row.dataset.catDelete, c = await getOne("categories", id);
      if (!c) return false;
      const [allProds, archivedCount] = await Promise.all([getAll("products"), countArchivedReceiptsForCategory(id)]);
      const prods = allProds.filter((x) => x.categoryId === id);
      const msgLines = [`Il reparto \u201C${esc(c.name)}\u201D verr\xE0 rimosso definitivamente.`];
      if (prods.length) msgLines.push("Gli articoli corrispondenti rimarranno disponibili nel database come \u201CSenza reparto\u201D.");
      if (archivedCount > 0) msgLines.push(`Presente in <strong>${archivedCount} ${archivedCount === 1 ? "spesa archiviata" : "spese archiviate"}</strong> (gli articoli attivi risulteranno \u201CSenza reparto\u201D).`);
      msgLines.push("Procedere comunque?");
      const msg = msgLines.join("<br>");
      const yes = await confirmDialog("Elimina reparto", msg, "Elimina", { closeButton: false, backdropClose: false });
      if (!yes) return false;
      const [routes, allCats, receipts] = await Promise.all([
        getAll("storeCategoryRoutes"),
        getAll("categories"),
        getAll("archivedReceipts")
      ]);
      const pMap = Object.fromEntries(allProds.map((x) => [x.id, x]));
      const cMap = Object.fromEntries(allCats.map((x) => [x.id, x]));
      const frozenReceipts = prepareFrozenReceiptsForCategoryDelete(new Set([id]), pMap, cMap, receipts);
      const delRoutes = routes.filter((r) => r.categoryId === id);
      const tombId = uuid();
      const tx = state.db.transaction(["categories", "products", "storeCategoryRoutes", "archivedReceipts", "tombstones"], "readwrite");
      tx.objectStore("categories").delete(id);
      for (const x of prods) tx.objectStore("products").put({ ...x, categoryId: null, updatedAt: now() });
      for (const r of delRoutes) tx.objectStore("storeCategoryRoutes").delete(r.id);
      for (const fr of frozenReceipts) tx.objectStore("archivedReceipts").put(fr);
      tx.objectStore("tombstones").put({ id: tombId, entityType: "category", entityId: id, deletedAt: now(), revision: Date.now() });
      await txDone(tx);
      await renderCategories();
      showToast("Reparto eliminato");
    });
  };
  inp.value = String(state.catsSearchQuery || "").toLocaleUpperCase("it").slice(0, 25);
  inp.addEventListener("input", paint);
  attachSearchClear(inp, paint);
  paint();
  $("#newCategoryBtn").onclick = () => openCategoryForm(null);
  d.onclick = async () => {
    const targets = filteredCats();
    if (!targets.length) return;
    const qTrim = String(state.catsSearchQuery || "").trim();
    const isFiltered = !!qTrim;
    const dlgTitle = isFiltered ? (targets.length === 1 ? "Elimina reparto" : "Elimina reparti") : "Elimina tutti i reparti";
    const dlgBtn = isFiltered ? "Elimina" : "Elimina tutti";
    const dlgMsg = !isFiltered
      ? "Tutti i reparti verranno rimossi definitivamente.<br>Gli articoli corrispondenti rimarranno disponibili nel database come \u201CSenza reparto\u201D.<br>Procedere comunque?"
      : (targets.length === 1
        ? `Il reparto \u201C${esc(targets[0].name)}\u201D verr\xE0 rimosso definitivamente.<br>Gli articoli corrispondenti rimarranno disponibili nel database come \u201CSenza reparto\u201D.<br>Procedere comunque?`
        : `I ${targets.length} reparti filtrati (ricerca \u201C${esc(qTrim)}\u201D) verranno rimossi definitivamente.<br>Gli articoli corrispondenti rimarranno disponibili nel database come \u201CSenza reparto\u201D.<br>Procedere comunque?`);
    if (!await confirmDialog(dlgTitle, dlgMsg, dlgBtn, { backdropClose: false })) return;
    const [prods, routes, receipts] = await Promise.all([getAll("products"), getAll("storeCategoryRoutes"), getAll("archivedReceipts")]);
    const pMap = Object.fromEntries(prods.map((x) => [x.id, x]));
    const cMap = Object.fromEntries(cats.map((x) => [x.id, x]));
    const catIds = new Set(targets.map((c) => c.id));
    const frozenReceipts = prepareFrozenReceiptsForCategoryDelete(catIds, pMap, cMap, receipts);
    const tx = state.db.transaction(["categories", "products", "storeCategoryRoutes", "archivedReceipts", "tombstones"], "readwrite");
    for (const c of targets) {
      tx.objectStore("categories").delete(c.id);
      tx.objectStore("tombstones").put({ id: uuid(), entityType: "category", entityId: c.id, deletedAt: now(), revision: Date.now() });
    }
    for (const x of prods) if (x.categoryId && catIds.has(x.categoryId)) tx.objectStore("products").put({ ...x, categoryId: null, updatedAt: now() });
    for (const r of routes) if (catIds.has(r.categoryId)) tx.objectStore("storeCategoryRoutes").delete(r.id);
    for (const fr of frozenReceipts) tx.objectStore("archivedReceipts").put(fr);
    await txDone(tx);
    state.catsSearchQuery = "";
    await renderCategories();
    showToast(targets.length === 1 ? "Reparto eliminato" : "Reparti eliminati");
  };
}

export async function createCategoryRecord(name) {
  const [existingCats, receipts] = await Promise.all([getAll("categories"), getAll("archivedReceipts")]);
  const orphanMatch = findOrphanCategoryMatch(name, existingCats, receipts);
  let relinked = false;
  let catId = uuid();
  if (orphanMatch) {
    relinked = await promptArchiveRelink({
      entityLabel: "Il reparto",
      entityName: name,
      receiptCount: orphanMatch.receiptCount
    });
    if (relinked) catId = orphanMatch.primaryId;
  }
  const c = { id: catId, name, nameNormalized: norm(name), createdAt: now(), updatedAt: now() };
  if (relinked) {
    const [allProds, allTombstones] = await Promise.all([getAll("products"), getAll("tombstones")]);
    const prodIdSet = new Set(orphanMatch.productIds);
    const tx = state.db.transaction(["categories", "products", "archivedReceipts", "tombstones"], "readwrite");
    tx.objectStore("categories").put(c);
    deleteStaleTombstonesInTx(tx, "category", [catId], allTombstones);
    unifyOrphanCategoryIdsInTx(tx, catId, orphanMatch.orphanIds, receipts);
    for (const pr of allProds) {
      if (prodIdSet.has(pr.id) && !pr.categoryId) {
        tx.objectStore("products").put({ ...pr, categoryId: catId, updatedAt: now() });
      }
    }
    await txDone(tx);
  } else {
    await putOne("categories", c);
  }
  return { category: c, relinked, receiptCount: relinked ? orphanMatch.receiptCount : 0 };
}

export function openNewCategoryWindow(onClose, opts = {}) {
  const keepModalOnClose = !!opts.keepModalOnClose;
  const input = () => $("#categoryName");
  const setStatus = (msg, type = "") => {
    const el = $("#catNameStatus");
    if (!el) return;
    el.textContent = msg;
    el.className = "field-status" + (type === "info" ? " is-info" : type === "error" ? " is-error" : "");
  };
  let dec;
  const add = async () => {
    const name = input().value.trim().toLocaleUpperCase("it");
    if (!name) {
      setStatus("");
      showToast("Inserisci il nome del reparto.");
      input().classList.remove("caret-hidden");
      input().focus();
      return;
    }
    if (name.length > 25) {
      setStatus("Massimo 25 caratteri.", "error");
      input().classList.remove("caret-hidden");
      input().focus();
      return;
    }
    if ((await getAll("categories")).some((x) => x.nameNormalized === norm(name))) {
      setStatus("Reparto gi\xE0 presente.", "error");
      input().classList.remove("caret-hidden");
      input().focus();
      return;
    }
    const { relinked } = await createCategoryRecord(name);
    input().value = "";
    if (dec) dec.setInitial("");
    input().classList.remove("caret-hidden");
    input().focus();
    setStatus(relinked ? "Reparto aggiunto e ricollegato allo storico." : "Nuovo reparto aggiunto.", "info");
  };
  modal("Nuovo reparto", '<div class="field" style="margin-bottom:28px"><div class="label-row"><label for="categoryName">Nome <span class="label-hint">(max 25 caratteri)</span></label><span class="field-status" id="catNameStatus" aria-live="polite"></span></div><input id="categoryName" type="text" maxlength="25" placeholder="Es. SALUMI" autocomplete="off" autocapitalize="characters"></div>', [
    { label: "Chiudi", class: "btn-plain", action: () => {
      if (keepModalOnClose) {
        state.currentModal = null;
        state.currentModalKeep = false;
        onClose();
      } else {
        closeModal(false);
        onClose();
      }
    } },
    { label: "Aggiungi", class: "btn-primary", action: add }
  ], { closeButton: false, backdropClose: false, alignTop: true, themed: true, keepModalOnClose, onClose });
  forceUppercaseInput(input());
  dec = decorateInput(input(), { initial: "", keepFocus: true, onNo: () => setStatus("") });
  input().addEventListener("input", () => setStatus(""));
  $("#modalRoot").querySelectorAll("[data-modal-action]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    if (b.dataset.modalAction === "1") {
      b.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    }
  });
  input().addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input().blur();
    }
  });
  setTimeout(() => input()?.focus(), 80);
}

export async function openCategoryProductPicker(id) {
  const [all, cmap] = await Promise.all([allProductsSorted(), categoryMap()]);
  modal("Aggiungi articolo", '<div class="pick-sticky-head"><button type="button" class="btn btn-primary btn-block" id="pickNew" style="margin-bottom:10px">\uFF0B Crea nuovo articolo</button><div class="field" style="margin-bottom:0"><input id="pickSearch" type="search" class="search-input" maxlength="25" placeholder="Cerca articolo\u2026" autocomplete="off"></div></div><div id="pickList"></div>', [], { closeButton: true, backdropClose: false, keepModalOnClose: true, alignTop: true, themed: true, onClose: () => openCategoryForm(id, true) });
  const inp = $("#pickSearch");
  const paint = () => {
    const f = filterBySearch(all, inp.value, productSearchText);
    $("#pickList").innerHTML = f.map((p) => {
      const dp = productDisplayParts(p);
      const brandRow = dp.brand ? `<span class="row-brand">${esc(dp.brand)}</span>` : "";
      const hasCat = !!(p.categoryId && cmap[p.categoryId]);
      const catLabel = hasCat ? cmap[p.categoryId].name : "Senza reparto";
      return `<button type="button" class="pick-opt" data-pick="${p.id}" ${p.categoryId === id ? "disabled" : ""}><span class="item-top-row"><strong class="row-name">${dp.titleHtml}</strong><span class="row-qty">${esc(displayUnit(p))}</span></span>${brandRow}<span class="pick-sub${hasCat ? "" : " it"}">${esc(catLabel)}</span></button>`;
    }).join("") || '<div class="empty">Nessun articolo trovato.</div>';
    $("#pickList").querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", async () => {
      const pr = all.find((x) => x.id === b.dataset.pick);
      if (!pr) return;
      if (pr.categoryId && pr.categoryId !== id && cmap[pr.categoryId]) {
        const curCatName = cmap[pr.categoryId].name;
        const yes = await confirmDialog(
          "Cambio abbinamento",
          `L\u2019articolo \xE8 gi\xE0 abbinato al reparto <strong>${esc(curCatName)}</strong>. Si desidera procedere con il cambio abbinamento?`,
          "Procedi",
          { closeButton: false, backdropClose: false, overlay: true, cancelFirst: true, confirmClass: "btn-primary", themed: true }
        );
        if (!yes) return;
      }
      await putOne("products", { ...pr, categoryId: id, updatedAt: now() });
      state.currentModal = null;
      state.currentModalKeep = false;
      await openCategoryForm(id, true);
      showToast("Articolo aggiunto al reparto");
    }));
  };
  attachSearchClear(inp, paint);
  inp.addEventListener("input", () => {
    if (inp.value.length > 25) inp.value = inp.value.slice(0, 25);
    paint();
  });
  paint();
  $("#pickNew").addEventListener("click", () => {
    state.currentModal = null;
    state.currentModalKeep = false;
    openProductForm(null, "categoryPicker", id);
  });
}

export async function openCategoryForm(id, keep = false) {
  if (!id) {
    openNewCategoryWindow(() => renderCategories());
    return;
  }
  if (!keep) {
    state.catDetailQuery = "";
    state.catScrollY = window.scrollY;
  }
  const c = await getOne("categories", id);
  if (!c) return;
  const all = (await allProductsSorted()).filter((p) => p.categoryId === id);
  const addProdIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="13.5" height="15.5" rx="3" fill="#2d6ea9"/><path d="M6 7.5h7.5M6 11h5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.2" cy="17.2" r="5.2" fill="#159447" stroke="#ffffff" stroke-width="1.3"/><path d="M17.2 14.5v5.4M14.5 17.2h5.4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const body = `<div class="field"><label for="categoryName">Nome <span class="label-hint">(max 25 caratteri)</span></label><div class="name-box"><input id="categoryName" type="text" maxlength="25" value="${esc(c.name)}" placeholder="Es. SALUMI" autocomplete="off" autocapitalize="characters"><button type="button" class="name-no" id="categoryNameNo" aria-label="Ripristina il nome precedente" title="Ripristina il nome precedente">${SVG_X}</button><button type="button" class="name-ok" id="categoryNameOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button></div></div><div class="field" style="margin-bottom:8px"><div class="label-row"><label>Articoli in questo reparto <span class="count" id="catMembersCount"></span></label><button type="button" class="create-product-btn-square cat-add-product-btn" id="catAddProduct" aria-label="Aggiungi articolo" title="Aggiungi articolo">${addProdIcon}</button></div></div><div class="field"><input id="catMembersSearch" type="search" class="search-input" maxlength="25" placeholder="Cerca articolo o marca..." aria-label="Cerca articolo o marca" autocomplete="off"></div><div id="catMembers"></div>`;
  modal("Dettagli reparto", body, [], { closeButton: true, backdropClose: false, alignTop: true, themed: true, onClose: async () => {
    await renderCategories();
    window.scrollTo(0, state.catScrollY);
  } });
  const input = $("#categoryName"), box = input.closest(".name-box"), undo = $("#categoryNameNo"), okBtn = $("#categoryNameOk");
  forceUppercaseInput(input);
  const showEditIcons = () => box.classList.add("dirty");
  const save = async () => {
    const name = input.value.trim().toLocaleUpperCase("it");
    input.value = name;
    if (name === c.name) {
      box.classList.remove("dirty");
      return;
    }
    const err = !name ? "Inserisci il nome del reparto." : name.length > 25 ? "Il nome del reparto pu\xF2 contenere al massimo 25 caratteri." : (await getAll("categories")).some((x) => x.id !== id && x.nameNormalized === norm(name)) ? "Esiste gi\xE0 un reparto con questo nome." : "";
    if (err) {
      showToast(err);
      input.value = c.name;
      box.classList.remove("dirty");
      return;
    }
    c.name = name;
    c.nameNormalized = norm(name);
    c.updatedAt = now();
    await putOne("categories", c);
    box.classList.remove("dirty");
    showToast("Nome aggiornato");
  };
  input.addEventListener("focus", showEditIcons);
  input.addEventListener("click", showEditIcons);
  input.addEventListener("input", showEditIcons);
  input.addEventListener("blur", () => {
    if (box.classList.contains("dirty")) save();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      okBtn.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      undo.click();
    }
  });
  undo.addEventListener("mousedown", (e) => e.preventDefault());
  okBtn.addEventListener("mousedown", (e) => e.preventDefault());
  okBtn.addEventListener("click", async () => {
    await save();
    input.blur();
    releaseModalKeyboard();
  });
  undo.addEventListener("click", () => {
    input.value = c.name;
    box.classList.remove("dirty");
    input.blur();
    releaseModalKeyboard();
  });
  const list = $("#catMembers"), ms = $("#catMembersSearch");
  ms.value = (state.catDetailQuery || "").slice(0, 25);
  const paint = () => {
    state.catDetailQuery = ms.value;
    const f = filterBySearch(all, ms.value, productSearchText);
    $("#catMembersCount").textContent = "(" + all.length + ")";
    list.innerHTML = f.map((p) => {
      const dp = productDisplayParts(p);
      const brandRow = dp.brand ? `<span class="row-brand">${esc(dp.brand)}</span>` : '<span class="row-brand is-empty" aria-hidden="true">&nbsp;</span>';
      return swipeWrap(`<div class="list-row compact cat-member-row" data-cat-rm="${p.id}"><button type="button" class="row-button" data-cat-open="${p.id}"><span class="item-top-row"><span class="row-name">${dp.titleHtml}</span><span class="row-qty">${esc(displayUnit(p))}</span></span>${brandRow}</button></div>`, "swipe-compact");
    }).join("") || `<div class="empty">${all.length ? "Nessun articolo trovato." : "Nessun articolo ancora abbinato."}</div>`;
    list.querySelectorAll("[data-cat-open]").forEach((b) => b.addEventListener("click", () => openProductForm(b.dataset.catOpen, "categoryDetail", id)));
    bindSwipeDelete(list, "[data-cat-rm]", async (row) => {
      const pr = all.find((x) => x.id === row.dataset.catRm);
      if (!pr) return;
      await putOne("products", { ...pr, categoryId: null, updatedAt: now() });
      await openCategoryForm(id, true);
      showUndoToast("Articolo dissociato", async () => {
        await putOne("products", pr);
        if ($("#catMembers")) await openCategoryForm(id, true);
      });
    });
  };
  attachSearchClear(ms, paint);
  ms.addEventListener("input", () => {
    if (ms.value.length > 25) ms.value = ms.value.slice(0, 25);
    paint();
  });
  paint();
  $("#catAddProduct").addEventListener("click", () => openCategoryProductPicker(id));
}
