// Gestione catalogo articoli e modulo creazione/modifica prodotto
import { state } from "./state.js";
import { PROD_BRAND_MAX, PROD_CONFEZIONE_UNITS, PROD_LENGTH_UNITS, PROD_NAME_MAX, PROD_SFUSO_UNITS, PROD_VOLUME_UNITS, PROD_WEIGHT_UNITS, SVG_CHK, SVG_CIRCLED_PLUS, SVG_CIRCLE_X, SVG_FILTER_CLEAR, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, assignUnit, composeProductDescription, esc, eurosFromInput, extractProductFields, filterBySearch, fitStoreChipLabels, fmtQtyUnit, formatPackQtyValue, formatTitleWithNetHtml, isLengthPackUnit, isPiecePackUnit, isVolumePackUnit, isWeightPackUnit, norm, now, packQtyPlaceholderFor, packQtyValid, parseQty, productDisplayParts, productSearchText, qtyValid, quantityStepValue, salesUnitForPackaging, storeChipHtml, storeHasColors, storesDescFor, uuid } from "./calculations.js";
import { allCategoriesSorted, allProductsSorted, allStoresSorted, categoryMap, getAll, getOne, putOne, settings, storeIdsForProduct, txDone } from "./storage.js";
import { attachSearchClear, bindSwipeDelete, closeModal, confirmDialog, customDropdown, decorateInput, forceUppercaseInput, infoPop, modal, releaseModalKeyboard, selectAllOnFocus, setDropdownValue, showToast, singleFilterHtml, swipeWrap, tipBtn, updateSingleFilterUI, wireCustomDropdown, wireSingleFilter } from "./ui.js";
import { actuallyAddItem, openAddItem, openNewListItemEditor, renderList } from "./shoppingList.js";
import { openCategoryForm, openCategoryProductPicker, renderCategories } from "./categories.js";
import { render } from "./router.js";

export async function renderProducts() {
  const [products, cats, catList, stores2, assoc] = await Promise.all([
    allProductsSorted(),
    categoryMap(),
    allCategoriesSorted(),
    allStoresSorted(),
    getAll("productStores")
  ]);
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
  const pv = state.productsView;
  if (typeof pv.store !== "string" || (pv.store !== "all" && pv.store !== "__none__" && !stores2.some((x) => x.id === pv.store))) pv.store = "all";
  if (typeof pv.cat !== "string" || (pv.cat !== "all" && pv.cat !== "__none__" && !catList.some((c) => c.id === pv.cat))) pv.cat = "all";
  const matchesStore = (p, sid) => sid === "all" || hasInStore(p, sid);
  const matchesCat = (p, cid) => cid === "all" || (cid === "__none__" ? !p.categoryId : p.categoryId === cid);
  const computeOpts = () => {
    const storeVal = pv.store, catVal = pv.cat;
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
  $("#appMain").innerHTML = `<div class="toolbar"><div class="title-row"><h1>Articoli</h1><span class="title-count-badge" id="productsCount">${products.length}</span>${infoBtn}</div><button type="button" class="header-icon trash-mini" id="delAllProductsBtn" aria-label="Elimina tutti gli articoli" title="Elimina tutti gli articoli">${TRASH_OFFICE}</button></div>${infoPop("Crea e gestisci il database dei tuoi articoli.<br>Per eliminare un singolo articolo, scorri il relativo riquadro verso destra.")}<div class="sticky-action-wrap"><button class="btn btn-primary btn-block" id="newProductBtn">${SVG_CIRCLED_PLUS}<span>Crea un nuovo articolo</span></button></div><div class="prod-filters-box prod-filters-split"><div class="prod-filters-head"><span class="prod-filters-title">Filtra per</span><button type="button" class="filter-clear" id="resetProdFilters" aria-label="Azzera tutti i filtri" title="Azzera tutti i filtri">${SVG_FILTER_CLEAR}<span>Azzera</span></button></div><div class="prod-filters-grid">${singleFilterHtml({ id: "prodFilterStore", allLabel: "Tutti i supermercati", options: curOpts.storeOpts, selectedValue: pv.store, allDisabled: curOpts.allStoresDisabled })}${singleFilterHtml({ id: "prodFilterCat", allLabel: "Tutti i reparti", options: curOpts.catOpts, selectedValue: pv.cat, allDisabled: curOpts.allCatsDisabled })}</div></div><div class="products-search-sticky"><div class="search-wrap"><input type="search" class="search-input" id="productsSearch" placeholder="Cerca articolo o marca..." aria-label="Cerca articolo o marca" autocomplete="off"></div></div><div id="productsList"></div>`;
  const d = $("#delAllProductsBtn");
  const scopeOf = () => products.filter((x) => matchesStore(x, pv.store) && matchesCat(x, pv.cat));
  const paint = () => {
    curOpts = computeOpts();
    pv.q = $("#productsSearch").value;
    const scope = scopeOf(), filtered = filterBySearch(scope, pv.q, productSearchText);
    d.disabled = !scope.length;
    d.classList.toggle("dim", !scope.length);
    updateSingleFilterUI("prodFilterStore", { allLabel: "Tutti i supermercati", options: curOpts.storeOpts, selectedValue: pv.store, allDisabled: curOpts.allStoresDisabled });
    updateSingleFilterUI("prodFilterCat", { allLabel: "Tutti i reparti", options: curOpts.catOpts, selectedValue: pv.cat, allDisabled: curOpts.allCatsDisabled });
    {
      const rf = $("#resetProdFilters");
      const storeFiltered = !curOpts.allStoresDisabled && !curOpts.showAllStores;
      const catFiltered = !curOpts.allCatsDisabled && !curOpts.showAllCats;
      const act = !!(storeFiltered || catFiltered || (pv.q && pv.q.trim()));
      rf.disabled = !act;
      rf.classList.toggle("dim", !act);
    }
    $("#productsCount").textContent = String(filtered.length);
    $("#productsList").innerHTML = filtered.length ? filtered.map((p) => {
      const dp = productDisplayParts(p);
      const brandRow = dp.brand ? `<span class="row-brand">${esc(dp.brand)}</span>` : "";
      const catLabel = cats[p.categoryId]?.name || "Senza reparto";
      const catHtml = p.categoryId && cats[p.categoryId] ? esc(catLabel) : `<span class="it">${esc(catLabel)}</span>`;
      return swipeWrap(`<div class="list-row compact prod-card-row" data-delete-product="${p.id}"><button type="button" class="row-button" style="text-align:left" data-product="${p.id}"><span class="item-top-row"><span class="row-name">${dp.titleHtml}</span><span class="row-qty">${esc(assignUnit(p.unit))}</span></span>${brandRow}<span class="product-meta">${catHtml}</span></button></div>`, "swipe-compact");
    }).join("") : '<div class="empty">Nessun articolo. Puoi crearne uno con il pulsante qui sopra.</div>';
    $("#productsList").querySelectorAll("[data-product]").forEach((b) => b.addEventListener("click", () => openProductForm(b.dataset.product, "products")));
    bindSwipeDelete($("#productsList"), "[data-delete-product]", async (row) => {
      const pid = row.dataset.deleteProduct;
      const p = await getOne("products", pid);
      if (!p) return false;
      const dpDel = productDisplayParts(p);
      const delLabel = [dpDel.title, dpDel.brand].filter(Boolean).join(" ") || p.name;
      const yes = await confirmDialog("Elimina articolo", `L\u2019articolo \u201C${esc(delLabel)}\u201D verr\xE0 rimosso definitivamente dal database. Procedere comunque?`, "Elimina", { closeButton: false, backdropClose: false });
      if (!yes) return false;
      const [associations, prices, items] = await Promise.all([getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems")]);
      const snapPs = associations.filter((x) => x.productId === pid);
      const snapPp = prices.filter((x) => x.productId === pid);
      const snapIts = items.filter((x) => x.productId === pid);
      const tombId = uuid();
      const tx = state.db.transaction(["products", "productStores", "productPrices", "shoppingListItems", "tombstones"], "readwrite");
      tx.objectStore("products").delete(pid);
      for (const x of snapPs) tx.objectStore("productStores").delete(x.id);
      for (const x of snapPp) tx.objectStore("productPrices").delete(x.id);
      for (const x of snapIts) tx.objectStore("shoppingListItems").delete(x.id);
      tx.objectStore("tombstones").put({ id: tombId, entityType: "product", entityId: pid, deletedAt: now(), revision: Date.now() });
      await txDone(tx);
      await renderProducts();
      showToast("Articolo eliminato");
    });
  };
  $("#productsSearch").value = pv.q;
  $("#productsSearch").addEventListener("input", paint);
  attachSearchClear($("#productsSearch"), paint);
  wireSingleFilter("prodFilterStore", {
    onSelect: (val) => {
      pv.store = val || "all";
      paint();
    }
  });
  wireSingleFilter("prodFilterCat", {
    onSelect: (val) => {
      pv.cat = val || "all";
      paint();
    }
  });
  $("#resetProdFilters").onclick = () => {
    pv.store = "all";
    pv.cat = "all";
    pv.q = "";
    const sInp = $("#productsSearch");
    if (sInp) sInp.value = "";
    paint();
  };
  d.onclick = async () => {
    const scope = scopeOf();
    if (!scope.length) return;
    let msg = "Tutti gli articoli del database verranno rimossi definitivamente.<br>Procedere comunque?";
    if (!curOpts.showAllCats || !curOpts.showAllStores) {
      const parts = [];
      if (!curOpts.showAllCats) {
        const cid = pv.cat;
        const cn = cid === "__none__" ? "Senza reparto" : (catList.find((c) => c.id === cid) || {}).name;
        parts.push(cid === "__none__" ? "senza reparto" : `del reparto \u201C${esc(cn)}\u201D`);
      }
      if (!curOpts.showAllStores) {
        const sid = pv.store;
        const sn = (stores2.find((x) => x.id === sid) || {}).name;
        parts.push(sid === "__none__" ? "senza supermercato" : `del supermercato \u201C${esc(sn)}\u201D`);
      }
      msg = "Tutti gli articoli " + parts.join(" ") + " verranno rimossi definitivamente.<br>Procedere comunque?";
    }
    if (!await confirmDialog("Elimina articoli", msg, "Elimina", { backdropClose: false })) return;
    const ids = new Set(scope.map((x) => x.id)), [ps, pp, its] = await Promise.all([getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems")]);
    const tx = state.db.transaction(["products", "productStores", "productPrices", "shoppingListItems", "tombstones"], "readwrite");
    for (const x of scope) {
      tx.objectStore("products").delete(x.id);
      tx.objectStore("tombstones").put({ id: uuid(), entityType: "product", entityId: x.id, deletedAt: now(), revision: Date.now() });
    }
    ps.forEach((x) => {
      if (ids.has(x.productId)) tx.objectStore("productStores").delete(x.id);
    });
    pp.forEach((x) => {
      if (ids.has(x.productId)) tx.objectStore("productPrices").delete(x.id);
    });
    its.forEach((x) => {
      if (ids.has(x.productId)) tx.objectStore("shoppingListItems").delete(x.id);
    });
    await txDone(tx);
    pv.q = "";
    await renderProducts();
    showToast("Articoli eliminati");
  };
  paint();
  $("#newProductBtn").addEventListener("click", () => openProductForm(null, "products"));
}

export async function openProductForm(productId, returnPage = "products", returnCategoryId = null, returnFn = null, keepCategoryId = null) {
  const [p, cats, ss, assoc, prices, allProducts, st] = await Promise.all([
    productId ? getOne("products", productId) : Promise.resolve(null),
    allCategoriesSorted(),
    allStoresSorted(),
    productId ? storeIdsForProduct(productId) : Promise.resolve([]),
    getAll("productPrices"),
    getAll("products"),
    settings()
  ]);
  const existingBrands = [...new Set(
    allProducts
      .map((x) => String(x.brand || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("it"))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  state.editingProductId = productId;
  state.productReturnPage = returnPage;
  state.productReturnCategoryId = returnCategoryId;
  state.productReturnFn = returnFn;
  let filterPreselectedCat = "";
  let filterPreselectedStore = "";
  if (!productId) {
    const candidateCat = returnPage === "products" ? state.productsView.cat : (returnPage === "addItem" ? state.addItemViewState.cat : "");
    if (candidateCat && candidateCat !== "all" && candidateCat !== "__none__" && cats.some((c) => c.id === candidateCat)) {
      filterPreselectedCat = candidateCat;
    }
    const candidateStore = returnPage === "products" ? state.productsView.store : (returnPage === "addItem" ? state.addItemViewState.store : "");
    if (candidateStore && candidateStore !== "all" && candidateStore !== "__none__" && ss.some((s) => s.id === candidateStore)) {
      filterPreselectedStore = candidateStore;
    }
  }
  const validKeepCat = keepCategoryId && cats.some((c) => c.id === keepCategoryId) ? keepCategoryId : "";
  const selectedCategory = p?.categoryId || validKeepCat || returnCategoryId || filterPreselectedCat || "";
  const initFields = extractProductFields(p);
  const initialPackaging = initFields.packaging;
  const initialPackUnit = initFields.packUnit;
  const initialPackQtyStr = initialPackaging === "sfuso" ? (isPiecePackUnit(initialPackUnit) ? "1" : "1,000") : initFields.packQtyStr;
  const initialSalesUnit = salesUnitForPackaging(initialPackaging, initialPackUnit);
  const buildDescPreviewHtml = (itemNameVal, brandVal, packQtyVal, packUnitVal, packVal) => {
    const isSfuso = packVal === "sfuso";
    const qtyPart = composeProductDescription("", "", packQtyVal, packUnitVal, false, packVal);
    const line1Html = formatTitleWithNetHtml(itemNameVal, qtyPart, isSfuso);
    const line2 = String(brandVal || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("it");
    return `<span class="prod-desc-line1">${line1Html || "&nbsp;"}</span><span class="prod-desc-line2">${line2 ? esc(line2) : "&nbsp;"}</span>`;
  };
  const initialDescHtml = buildDescPreviewHtml(initFields.itemName, initFields.brand, initialPackQtyStr, initialPackUnit, initialPackaging);
  const initialIsWeight = isWeightPackUnit(initialPackUnit);
  const initialIsVol = isVolumePackUnit(initialPackUnit);
  const initialIsLen = isLengthPackUnit(initialPackUnit);
  const initialIsPiece = isPiecePackUnit(initialPackUnit);
  const initialWeightLabel = initialIsWeight ? initialPackUnit : "kg";
  const initialVolumeLabel = initialIsVol ? initialPackUnit : "lt";
  const initialLengthLabel = initialIsLen ? initialPackUnit : "m";
  const storeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-2-5H5L3 9Z"/><path d="M5 9v10h14V9M9 19v-6h6v6"/></svg>';
  const packIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg>';
  const looseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M5 9h14l-1.5 11h-11L5 9Z"/><circle cx="12" cy="14" r="2.2"/></svg>';
  const chevSvg = '<svg class="prod-um-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const storesDescText = storesDescFor(initialPackaging, initialPackUnit);
  const initialAddStore = st?.defaultStoreId && ss.some((s) => s.id === st.defaultStoreId) ? st.defaultStoreId : "";
  const addStoreOptions = ss.map((s) => {
    const chip = storeHasColors(s) ? storeChipHtml(s) : "";
    const nameHtml = chip || `<span class="dd-opt-name">${esc(s.name)}</span>`;
    return { ...s, menuName: s.name, labelHtml: nameHtml, menuHtml: nameHtml };
  });
  const addListBoxHtml = !productId ? `<div class="new-prod-add-list-box" id="addNewProdListBox"><label class="check-line new-prod-add-list-opt" for="addNewProdToList"><input type="checkbox" id="addNewProdToList"><span>Aggiungi alla lista della spesa</span></label><div class="new-prod-add-fields is-inactive" id="addNewProdFields"><div class="new-prod-store-row">${customDropdown("addNewProdStore", initialAddStore, addStoreOptions, true, true)}</div><div class="new-prod-qty-row" id="addNewProdQtyRow"><label for="addNewProdQty">Quantit\xE0<br>[<span class="new-prod-qty-unit">${esc(assignUnit(initialSalesUnit))}</span>]</label><div class="qty-row new-prod-qty-ctrl"><div class="name-box"><input id="addNewProdQty" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" translate="no" spellcheck="false" value="${esc(fmtQtyUnit(1, initialSalesUnit))}" disabled readonly tabindex="-1"><button type="button" class="name-no" id="addNewProdQtyNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="addNewProdQtyOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><button type="button" id="addNewProdQtyMinus" aria-label="Diminuisci quantit\xE0" disabled>\u2212</button><button type="button" id="addNewProdQtyPlus" aria-label="Aumenta quantit\xE0" disabled>\uFF0B</button></div></div><div class="new-prod-discount-row manual-amount-box" id="addNewProdDiscountRow"><label for="addNewProdDiscount">Prezzo Unit.<br><strong>SCONTATO</strong></label><div class="manual-input-wrap"><div class="name-box"><button type="button" class="manual-price-clear" id="addNewProdDiscountClear" aria-label="Cancella prezzo scontato" title="Cancella prezzo scontato" hidden>${SVG_CIRCLE_X}</button><input id="addNewProdDiscount" type="text" inputmode="decimal" enterkeyhint="done" maxlength="8" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" disabled readonly tabindex="-1"><button type="button" class="name-no" id="addNewProdDiscountNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="addNewProdDiscountOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><span class="price-eur">\u20AC/<span class="new-prod-qty-unit">${esc(assignUnit(initialSalesUnit))}</span></span></div></div></div></div>` : "";
  const body = `<div class="product-editor"><form id="productForm"><div class="product-main-card">
    ${initFields.isLegacy ? `<div class="prod-legacy-note">Articolo da versione precedente (<strong>${esc(initFields.legacyName)}</strong>): completa i campi qui sotto per uniformare la descrizione.</div>` : ""}
    <div class="field"><div class="label-row"><label for="prodCategory">Reparto</label><span class="req req-pill" id="reqCat">Obbligatorio</span></div>${customDropdown("prodCategory", selectedCategory, [{ id: "", name: "Seleziona reparto" }].concat(cats.map((c) => ({ id: c.id, name: c.name })), [{ id: "__new__", name: "\uFF0B Nuovo reparto" }]), false, true, true)}</div>
    <div class="field"><div class="label-row"><div class="label-title-group"><label for="prodItemName">Nome</label>${tipBtn("prodNameTip", "Suggerimento nome articolo")}<span class="label-hint">(max ${PROD_NAME_MAX} caratteri)</span></div><span class="req req-pill" id="reqItemName">Obbligatorio</span></div><div class="info-pop tip-pop" id="prodNameTip" hidden>Inserire il nome dell\u2019articolo senza indicare la marca (es. Aceto di mele).</div><input id="prodItemName" type="text" maxlength="${PROD_NAME_MAX}" enterkeyhint="next" value="${esc(initFields.itemName)}" required autocomplete="off" placeholder="Es. Olio EVO, Gnocchi, Wafers"></div>
    <div class="field"><div class="label-row"><div class="label-title-group"><label for="prodBrand">Marca</label><span class="label-hint">(max ${PROD_BRAND_MAX} caratteri)</span></div></div><div class="brand-ac-wrap" id="prodBrandAcWrap"><input id="prodBrand" type="text" maxlength="${PROD_BRAND_MAX}" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(initFields.brand)}" placeholder="Digitare eventuale marca" autocomplete="off" aria-autocomplete="inline"></div></div>
    <div class="field"><div class="label-row"><label id="prodPackagingLbl">Imballo</label></div><input type="hidden" id="prodPackaging" value="${esc(initialPackaging)}"><div class="prod-seg prod-seg-2" id="prodPackagingSeg" role="radiogroup" aria-labelledby="prodPackagingLbl"><button type="button" class="prod-seg-btn${initialPackaging === "confezione" ? " active" : ""}" data-pack-val="confezione" role="radio" aria-checked="${initialPackaging === "confezione" ? "true" : "false"}">${packIcon}<span>Confezione</span></button><button type="button" class="prod-seg-btn${initialPackaging === "sfuso" ? " active" : ""}" data-pack-val="sfuso" role="radio" aria-checked="${initialPackaging === "sfuso" ? "true" : "false"}">${looseIcon}<span>Sfuso</span></button></div></div>
    <div class="field"><div class="label-row"><div class="label-title-group"><label for="prodPackQty" id="prodNetContentLbl">Contenuto netto</label>${tipBtn("prodNetContentTip", "Suggerimento contenuto netto")}</div><span class="req req-pill" id="reqPackQty">Obbligatorio</span></div><div class="info-pop tip-pop" id="prodNetContentTip" hidden>Riportare il contenuto netto della confezione o solo l\u2019unit\u00E0 di misura se l\u2019articolo viene venduto sfuso.<ul class="tip-list"><li><em>Cassa di acqua di 6 bottiglie da 1,5 lt &gt; riportare <strong>9 lt</strong>;</em></li><li><em>Pomodori in confezione da 500 g &gt; riportare <strong>500 g</strong>;</em></li><li><em>Pomodori sfusi &gt; riportare <strong>kg</strong>.</em></li></ul></div><input type="hidden" id="prodPackUnit" value="${esc(initialPackUnit)}"><div class="prod-net-row"><div class="prod-seg prod-um-seg${initialPackaging === "sfuso" ? " is-loose" : ""}" id="prodPackUnitSeg" role="group" aria-labelledby="prodNetContentLbl"><div class="prod-um-dd" data-um-group="weight"><button type="button" class="prod-seg-btn prod-um-btn${initialIsWeight ? " active" : ""}" data-um-trigger="weight" aria-haspopup="listbox" aria-expanded="false"><span class="prod-um-label">${esc(initialWeightLabel)}</span>${chevSvg}</button><div class="prod-um-menu" data-um-menu="weight" role="listbox" hidden>${PROD_WEIGHT_UNITS.map((u) => `<button type="button" class="prod-um-opt${initialPackUnit === u ? " selected" : ""}" data-um-val="${u}" role="option" aria-selected="${initialPackUnit === u ? "true" : "false"}">${u}</button>`).join("")}</div></div><div class="prod-um-dd" data-um-group="volume"><button type="button" class="prod-seg-btn prod-um-btn${initialIsVol ? " active" : ""}" data-um-trigger="volume" aria-haspopup="listbox" aria-expanded="false"><span class="prod-um-label">${esc(initialVolumeLabel)}</span>${chevSvg}</button><div class="prod-um-menu" data-um-menu="volume" role="listbox" hidden>${PROD_VOLUME_UNITS.map((u) => `<button type="button" class="prod-um-opt${initialPackUnit === u ? " selected" : ""}" data-um-val="${u}" role="option" aria-selected="${initialPackUnit === u ? "true" : "false"}">${u}</button>`).join("")}</div></div><div class="prod-um-dd" data-um-group="length"><button type="button" class="prod-seg-btn prod-um-btn${initialIsLen ? " active" : ""}" data-um-trigger="length" aria-haspopup="listbox" aria-expanded="false"><span class="prod-um-label">${esc(initialLengthLabel)}</span>${chevSvg}</button><div class="prod-um-menu" data-um-menu="length" role="listbox" hidden>${PROD_LENGTH_UNITS.map((u) => `<button type="button" class="prod-um-opt${initialPackUnit === u ? " selected" : ""}" data-um-val="${u}" role="option" aria-selected="${initialPackUnit === u ? "true" : "false"}">${u}</button>`).join("")}</div></div><button type="button" class="prod-seg-btn prod-um-btn prod-um-direct${initialIsPiece ? " active" : ""}" data-um-direct="pz" aria-pressed="${initialIsPiece ? "true" : "false"}"><span class="prod-um-label">pz</span></button></div><div class="prod-net-qty-row${initialPackaging === "sfuso" ? " is-loose" : ""}" id="prodNetQtyRow"><label class="prod-net-qty-lbl" for="prodPackQty">Valore</label><div class="prod-net-qty-ctrl"><div class="name-box prod-qty-box"><input id="prodPackQty" type="text" inputmode="${initialIsPiece ? "numeric" : "decimal"}" enterkeyhint="done" maxlength="7" autocomplete="off" translate="no" spellcheck="false" value="${esc(initialPackQtyStr)}" placeholder="${esc(packQtyPlaceholderFor(initialPackUnit))}" ${initialPackaging === "sfuso" ? 'disabled readonly tabindex="-1" aria-disabled="true"' : ""}><button type="button" class="name-no" id="prodPackQtyNo" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" id="prodPackQtyOk" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><span class="prod-qty-unit-tag" id="prodPackQtyUnitTag">${esc(initialPackUnit)}</span></div></div></div></div>
    <div class="field prod-desc-field" id="prodDescCard"><div class="label-row"><label>Anteprima descrizione completa</label></div><div class="prod-desc-value" id="prodDescValue" aria-live="polite">${initialDescHtml}</div></div>
    ${addListBoxHtml}
  </div>
  <div class="product-stores-section"><div class="product-stores-head"><span class="product-stores-icon">${storeIcon}</span><div class="product-stores-text"><span class="product-stores-title">Supermercati e prezzi</span><span class="product-stores-desc" id="prodStoresDesc">${esc(storesDescText)}</span></div></div><div id="productStoreFields">${ss.map((s) => {
    const selected = assoc.includes(s.id) || (!productId && filterPreselectedStore === s.id), pr = prices.find((x) => x.productId === productId && x.storeId === s.id);
    return `<div class="card store-price-row"><label class="check-line"><input type="checkbox" data-store-check="${s.id}" ${selected ? "checked" : ""}>${storeChipHtml(s, { defaultBold: true })}</label><div class="price-wrap ${selected ? "" : "hidden"}" id="priceField-${s.id}"><span class="price-row-label">Prezzo [&euro;/<span class="store-price-unit">${esc(assignUnit(initialSalesUnit))}</span>]</span><div class="price-input-group"><div class="name-box"><input class="price-input" id="price-${s.id}" type="text" inputmode="decimal" enterkeyhint="done" maxlength="8" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" aria-label="Prezzo di ${esc(s.name)} in euro" value="${pr ? String((pr.amountMinor / 100).toFixed(2)).replace(".", ",") : ""}"><button type="button" class="name-no" data-price-no="${s.id}" aria-label="Annulla" title="Annulla">${SVG_X}</button><button type="button" class="name-ok" data-price-ok="${s.id}" aria-label="Conferma" title="Conferma">${SVG_CHK}</button></div><span class="price-eur">\u20AC</span></div></div></div>`;
  }).join("") || '<div class="empty">Non hai ancora creato supermercati. Puoi salvare l\u2019articolo senza associarlo a uno store.</div>'}</div></div></form></div>`;
  const buttons = [{ label: "Annulla", class: "btn-plain", action: () => {
    if (returnPage === "addItem" || returnPage === "list") {
      state.currentModal = null;
      state.currentModalKeep = false;
      openAddItem();
    } else if (returnPage === "editor") {
      state.currentModal = null;
      state.currentModalKeep = false;
      returnFn();
    } else if (returnPage === "categoryDetail") {
      state.currentModal = null;
      state.currentModalKeep = false;
      openCategoryForm(returnCategoryId, true);
    } else if (returnPage === "categoryPicker") {
      state.currentModal = null;
      state.currentModalKeep = false;
      openCategoryProductPicker(returnCategoryId);
    } else {
      closeModal();
    }
  } }, { label: productId ? "Salva" : "Aggiungi", class: "btn-primary", action: async () => saveProductForm(productId, returnPage, returnCategoryId) }];
  const onClose = returnPage === "editor" ? () => returnFn() : (returnPage === "list" || returnPage === "addItem") ? () => openAddItem() : returnPage === "categoryDetail" ? () => openCategoryForm(returnCategoryId, true) : returnPage === "categoryPicker" ? () => openCategoryProductPicker(returnCategoryId) : returnPage === "products" && !productId ? () => renderProducts() : null;
  modal(productId ? "Dettagli articolo" : "Nuovo articolo", body, buttons, { closeButton: true, backdropClose: false, onClose, alignTop: true, headerThemed: true, stickyFooter: true, keepModalOnClose: returnPage === "list" || returnPage === "addItem" || returnPage === "editor" || returnPage === "categoryDetail" || returnPage === "categoryPicker" });
  const formEl = $("#productForm");
  formEl.addEventListener("submit", (e) => e.preventDefault());
  wireCustomDropdown("prodCategory");
  if (!productId) wireCustomDropdown("addNewProdStore");

  const itemNameInp = $("#prodItemName");
  const brandInp = $("#prodBrand");
  const packInp = $("#prodPackaging");
  const packSeg = $("#prodPackagingSeg");
  const packUnitInp = $("#prodPackUnit");
  const packUnitSeg = $("#prodPackUnitSeg");
  const weightTrigger = packUnitSeg?.querySelector('[data-um-trigger="weight"]');
  const volumeTrigger = packUnitSeg?.querySelector('[data-um-trigger="volume"]');
  const lengthTrigger = packUnitSeg?.querySelector('[data-um-trigger="length"]');
  const pieceTrigger = packUnitSeg?.querySelector('[data-um-direct="pz"]');
  const weightMenu = packUnitSeg?.querySelector('[data-um-menu="weight"]');
  const volumeMenu = packUnitSeg?.querySelector('[data-um-menu="volume"]');
  const lengthMenu = packUnitSeg?.querySelector('[data-um-menu="length"]');
  const packQtyInp = $("#prodPackQty");
  const packQtyBox = packQtyInp?.closest(".name-box");
  const packQtyNo = $("#prodPackQtyNo");
  const packQtyOk = $("#prodPackQtyOk");
  const packQtyUnitTag = $("#prodPackQtyUnitTag");
  const prodNetQtyRow = $("#prodNetQtyRow");
  const descValueEl = $("#prodDescValue");
  const storesDescEl = $("#prodStoresDesc");

  const addListBox = $("#addNewProdListBox");
  const addListCb = $("#addNewProdToList");
  const addFieldsWrap = $("#addNewProdFields");
  const addStoreTrigger = $("#addNewProdStoreTrigger");
  const addStoreMenu = $("#addNewProdStoreMenu");
  const addQtyRow = $("#addNewProdQtyRow");
  const addQtyInp = $("#addNewProdQty");
  const addQtyBox = addQtyInp?.closest(".name-box");
  const addQtyNo = $("#addNewProdQtyNo");
  const addQtyOk = $("#addNewProdQtyOk");
  const addQtyMinus = $("#addNewProdQtyMinus");
  const addQtyPlus = $("#addNewProdQtyPlus");
  const addDiscInp = $("#addNewProdDiscount");
  const addDiscBox = addDiscInp?.closest(".name-box");
  const addDiscClear = $("#addNewProdDiscountClear");
  const addDiscNo = $("#addNewProdDiscountNo");
  const addDiscOk = $("#addNewProdDiscountOk");
  let savedAddQty = addQtyInp ? addQtyInp.value.trim() : fmtQtyUnit(1, initialSalesUnit);
  let savedAddDisc = "";
  let lastConfezioneUnit = initialPackaging === "confezione" ? initialPackUnit : "kg";
  let lastConfezioneQty = initialPackaging === "confezione" ? initFields.packQtyStr : "";
  let savedPackQty = packQtyInp ? packQtyInp.value.trim() : "";

  const currentSalesUnit = () => salesUnitForPackaging(packInp?.value || "confezione", packUnitInp?.value || "kg");

  const closeUnitMenus = () => {
    [weightMenu, volumeMenu, lengthMenu].forEach((m) => { if (m) m.hidden = true; });
    [weightTrigger, volumeTrigger, lengthTrigger].forEach((t) => { if (t) t.setAttribute("aria-expanded", "false"); });
  };

  let getEffectiveBrandVal = () => brandInp?.value || "";
  const syncDescriptionPreview = () => {
    if (descValueEl) descValueEl.innerHTML = buildDescPreviewHtml(itemNameInp?.value, getEffectiveBrandVal(), packQtyInp?.value, packUnitInp?.value, packInp?.value || "confezione");
  };

  const syncSalesUnitUI = () => {
    const pack = packInp?.value || "confezione";
    const pu = packUnitInp?.value || "kg";
    const su = salesUnitForPackaging(pack, pu);
    const u = assignUnit(su);
    $("#modalRoot").querySelectorAll(".store-price-unit, .new-prod-qty-unit").forEach((el) => { el.textContent = u; });
    if (storesDescEl) storesDescEl.textContent = storesDescFor(pack, pu);
    if (addQtyInp) {
      const q = parseQty(addQtyInp.value);
      if (Number.isFinite(q) && q > 0) {
        const adj = su === "pz" ? Math.max(1, Math.round(q)) : q;
        addQtyInp.value = fmtQtyUnit(adj, su);
      } else {
        addQtyInp.value = fmtQtyUnit(1, su);
      }
      savedAddQty = addQtyInp.value;
    }
  };

  const applyPackUnit = (u) => {
    const pack = packInp?.value || "confezione";
    const allowed = pack === "sfuso" ? PROD_SFUSO_UNITS : PROD_CONFEZIONE_UNITS;
    const resolved = allowed.includes(u)
      ? u
      : (pack === "sfuso" && isVolumePackUnit(u)
        ? "lt"
        : (pack === "sfuso" && isLengthPackUnit(u)
          ? "m"
          : (pack === "sfuso" && isPiecePackUnit(u) ? "pz" : "kg")));
    if (pack === "confezione") lastConfezioneUnit = resolved;
    if (packUnitInp) packUnitInp.value = resolved;
    const isWeight = isWeightPackUnit(resolved);
    const isVol = isVolumePackUnit(resolved);
    const isLen = isLengthPackUnit(resolved);
    const isPiece = isPiecePackUnit(resolved);
    if (weightTrigger) {
      weightTrigger.classList.toggle("active", isWeight);
      const lbl = weightTrigger.querySelector(".prod-um-label");
      if (lbl) lbl.textContent = isWeight ? resolved : "kg";
    }
    if (volumeTrigger) {
      volumeTrigger.classList.toggle("active", isVol);
      const lbl = volumeTrigger.querySelector(".prod-um-label");
      if (lbl) lbl.textContent = isVol ? resolved : "lt";
    }
    if (lengthTrigger) {
      lengthTrigger.classList.toggle("active", isLen);
      const lbl = lengthTrigger.querySelector(".prod-um-label");
      if (lbl) lbl.textContent = isLen ? resolved : "m";
    }
    if (pieceTrigger) {
      pieceTrigger.classList.toggle("active", isPiece);
      pieceTrigger.setAttribute("aria-pressed", isPiece ? "true" : "false");
    }
    packUnitSeg?.querySelectorAll(".prod-um-opt").forEach((opt) => {
      const sel = opt.dataset.umVal === resolved;
      opt.classList.toggle("selected", sel);
      opt.setAttribute("aria-selected", sel ? "true" : "false");
    });
    if (packQtyUnitTag) packQtyUnitTag.textContent = resolved;
    if (packQtyInp) {
      packQtyInp.placeholder = packQtyPlaceholderFor(resolved);
      packQtyInp.inputMode = isPiece ? "numeric" : "decimal";
      if (pack === "sfuso") {
        const looseVal = isPiece ? "1" : "1,000";
        packQtyInp.value = looseVal;
        savedPackQty = looseVal;
      }
    }
    packUnitSeg?.classList.remove("invalid");
    syncSalesUnitUI();
    syncDescriptionPreview();
  };

  const applyPackaging = (packVal, preferredUnit = null) => {
    const prevPack = packInp?.value || "confezione";
    const resolved = packVal === "sfuso" ? "sfuso" : "confezione";
    closeUnitMenus();
    if (packInp) packInp.value = resolved;
    packSeg?.querySelectorAll("[data-pack-val]").forEach((btn) => {
      const act = btn.dataset.packVal === resolved;
      btn.classList.toggle("active", act);
      btn.setAttribute("aria-checked", act ? "true" : "false");
    });
    packSeg?.classList.remove("invalid");
    packUnitSeg?.classList.toggle("is-loose", resolved === "sfuso");
    prodNetQtyRow?.classList.toggle("is-loose", resolved === "sfuso");
    if (resolved === "sfuso") {
      if (prevPack === "confezione" && packQtyInp) lastConfezioneQty = packQtyInp.value;
      const curU = packUnitInp?.value || "kg";
      const targetUnit = preferredUnit && PROD_SFUSO_UNITS.includes(preferredUnit)
        ? preferredUnit
        : (PROD_SFUSO_UNITS.includes(curU) ? curU : (isVolumePackUnit(curU) ? "lt" : (isLengthPackUnit(curU) ? "m" : "kg")));
      const looseVal = isPiecePackUnit(targetUnit) ? "1" : "1,000";
      if (packQtyInp) {
        packQtyInp.value = looseVal;
        savedPackQty = looseVal;
        packQtyInp.disabled = true;
        packQtyInp.readOnly = true;
        packQtyInp.tabIndex = -1;
        packQtyInp.setAttribute("aria-disabled", "true");
        packQtyInp.classList.remove("invalid");
        packQtyBox?.classList.remove("editing");
        if (document.activeElement === packQtyInp) packQtyInp.blur();
      }
      $("#reqPackQty")?.classList.remove("err");
      applyPackUnit(targetUnit);
    } else {
      if (packQtyInp) {
        packQtyInp.disabled = false;
        packQtyInp.readOnly = false;
        packQtyInp.tabIndex = 0;
        packQtyInp.setAttribute("aria-disabled", "false");
        if (prevPack === "sfuso") {
          packQtyInp.value = lastConfezioneQty;
          savedPackQty = lastConfezioneQty;
        }
      }
      applyPackUnit(preferredUnit || lastConfezioneUnit || "kg");
    }
  };

  if (brandInp) forceUppercaseInput(brandInp);
  const itemNameDec = itemNameInp ? decorateInput(itemNameInp, { onNo: () => { $("#reqItemName")?.classList.remove("err"); itemNameInp.classList.remove("invalid"); syncDescriptionPreview(); } }) : null;
  let clearBrandSuggestion = () => {};
  let commitBrandSuggestion = () => false;
  const brandDec = brandInp ? decorateInput(brandInp, {
    onNo: () => {
      brandInp.classList.remove("invalid");
      clearBrandSuggestion(false);
      syncDescriptionPreview();
    },
    onOk: () => {
      commitBrandSuggestion(false);
      brandDec?.setInitial(brandInp.value);
      syncDescriptionPreview();
      brandInp.blur();
      releaseModalKeyboard();
    }
  }) : null;
  if (itemNameInp && itemNameDec) itemNameInp._setInitial = (v) => itemNameDec.setInitial(v);
  if (brandInp && brandDec) brandInp._setInitial = (v) => brandDec.setInitial(v);

  itemNameInp?.addEventListener("input", () => {
    if (itemNameInp.value.length > PROD_NAME_MAX) itemNameInp.value = itemNameInp.value.slice(0, PROD_NAME_MAX);
    $("#reqItemName")?.classList.remove("err");
    itemNameInp.classList.remove("invalid");
    syncDescriptionPreview();
  });
  itemNameInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      itemNameDec?.setInitial(itemNameInp.value);
      brandInp?.focus();
    }
  });
  if (brandInp) {
    const brandNameBox = brandInp.closest(".name-box");
    let ghostEl = null;
    let ghostPrefixEl = null;
    let ghostRestEl = null;
    let currentSuggestion = "";
    let prevBrandVal = brandInp.value.toLocaleUpperCase("it");
    let lastInputWasDelete = false;
    let suppressNextBlurCommit = false;

    if (brandNameBox) {
      ghostEl = document.createElement("div");
      ghostEl.className = "brand-ghost";
      ghostEl.id = "prodBrandGhost";
      ghostEl.hidden = true;
      ghostEl.setAttribute("aria-hidden", "true");
      ghostPrefixEl = document.createElement("span");
      ghostPrefixEl.className = "brand-ghost-prefix";
      ghostRestEl = document.createElement("span");
      ghostRestEl.className = "brand-ghost-rest";
      ghostEl.append(ghostPrefixEl, ghostRestEl);
      brandNameBox.appendChild(ghostEl);
      brandNameBox.querySelector(".name-no")?.addEventListener("pointerdown", () => { suppressNextBlurCommit = true; });
    }

    getEffectiveBrandVal = () => currentSuggestion || brandInp.value;

    const renderBrandGhost = (prefix, full) => {
      currentSuggestion = full || "";
      const rest = full ? full.slice(prefix.length) : "";
      if (ghostPrefixEl) ghostPrefixEl.textContent = rest ? prefix : "";
      if (ghostRestEl) ghostRestEl.textContent = rest;
      if (ghostEl) {
        ghostEl.hidden = !rest;
        ghostEl.scrollLeft = brandInp.scrollLeft;
      }
      if (rest && brandNameBox) brandNameBox.classList.add("dirty");
    };

    clearBrandSuggestion = () => {
      renderBrandGhost("", "");
    };

    commitBrandSuggestion = (closeKb = false) => {
      if (!currentSuggestion) return false;
      const val = currentSuggestion;
      clearBrandSuggestion();
      brandInp.value = val;
      prevBrandVal = val;
      brandInp.classList.remove("invalid");
      brandDec?.setInitial(val);
      syncDescriptionPreview();
      if (closeKb) {
        brandInp.blur();
        releaseModalKeyboard();
      }
      return true;
    };

    brandInp._commitSuggestion = () => commitBrandSuggestion(false);

    const updateExcelAutocomplete = () => {
      const raw = brandInp.value.toLocaleUpperCase("it");
      const grew = raw.length > prevBrandVal.length;
      prevBrandVal = raw;
      if (!existingBrands.length || !raw || lastInputWasDelete || !grew || document.activeElement !== brandInp) {
        clearBrandSuggestion();
        return;
      }
      const atEnd = brandInp.selectionStart === brandInp.value.length && brandInp.selectionEnd === brandInp.value.length;
      if (!atEnd) {
        clearBrandSuggestion();
        return;
      }
      const match = existingBrands.find((b) => b.length > raw.length && b.startsWith(raw));
      if (match) renderBrandGhost(raw, match);
      else clearBrandSuggestion();
    };

    brandInp.addEventListener("beforeinput", (e) => {
      const it = e.inputType || "";
      lastInputWasDelete = it.startsWith("delete") || it === "historyUndo";
      if (currentSuggestion && (it === "deleteContentBackward" || it === "deleteContentForward")) {
        e.preventDefault();
        clearBrandSuggestion();
        syncDescriptionPreview();
      }
    });
    brandInp.addEventListener("input", () => {
      if (brandInp.value.length > PROD_BRAND_MAX) brandInp.value = brandInp.value.slice(0, PROD_BRAND_MAX);
      brandInp.classList.remove("invalid");
      updateExcelAutocomplete();
      lastInputWasDelete = false;
      syncDescriptionPreview();
    });
    brandInp.addEventListener("scroll", () => {
      if (ghostEl) ghostEl.scrollLeft = brandInp.scrollLeft;
    });
    brandInp.addEventListener("focus", () => {
      suppressNextBlurCommit = false;
      prevBrandVal = brandInp.value.toLocaleUpperCase("it");
    });
    brandInp.addEventListener("blur", () => {
      if (suppressNextBlurCommit) {
        suppressNextBlurCommit = false;
        clearBrandSuggestion();
        return;
      }
      if (currentSuggestion) commitBrandSuggestion(false);
    });
    brandInp.addEventListener("click", () => {
      if (currentSuggestion && (brandInp.selectionStart !== brandInp.value.length || brandInp.selectionEnd !== brandInp.value.length)) {
        clearBrandSuggestion();
        syncDescriptionPreview();
      }
    });
    brandInp.addEventListener("keydown", (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && currentSuggestion) {
        e.preventDefault();
        clearBrandSuggestion();
        syncDescriptionPreview();
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "Home") && currentSuggestion) {
        clearBrandSuggestion();
        syncDescriptionPreview();
        return;
      }
      if ((e.key === "Tab" || (e.key === "ArrowRight" && brandInp.selectionStart === brandInp.value.length)) && currentSuggestion) {
        if (e.key === "ArrowRight") e.preventDefault();
        commitBrandSuggestion(false);
        return;
      }
      if (e.key === "Escape" && currentSuggestion) {
        e.preventDefault();
        clearBrandSuggestion();
        syncDescriptionPreview();
        return;
      }
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        if (currentSuggestion) {
          commitBrandSuggestion(true);
          return;
        }
        clearBrandSuggestion();
        brandDec?.setInitial(brandInp.value);
        brandInp.blur();
        releaseModalKeyboard();
      }
    });
  }
  packSeg?.querySelectorAll("[data-pack-val]").forEach((btn) => {
    btn.addEventListener("click", () => applyPackaging(btn.dataset.packVal));
  });

  const umGroups = {
    weight: { defaultU: "kg", menu: weightMenu, trigger: weightTrigger, matches: isWeightPackUnit },
    volume: { defaultU: "lt", menu: volumeMenu, trigger: volumeTrigger, matches: isVolumePackUnit },
    length: { defaultU: "m", menu: lengthMenu, trigger: lengthTrigger, matches: isLengthPackUnit }
  };
  const handleGroupTrigger = (group) => {
    const cfg = umGroups[group];
    if (!cfg) return;
    const pack = packInp?.value || "confezione";
    if (pack === "sfuso") {
      closeUnitMenus();
      applyPackUnit(cfg.defaultU);
      return;
    }
    const alreadyInGroup = cfg.matches(packUnitInp?.value);
    Object.entries(umGroups).forEach(([k, g]) => {
      if (k !== group) {
        if (g.menu) g.menu.hidden = true;
        if (g.trigger) g.trigger.setAttribute("aria-expanded", "false");
      }
    });
    if (!alreadyInGroup) {
      applyPackUnit(cfg.defaultU);
      if (cfg.menu) cfg.menu.hidden = false;
      if (cfg.trigger) cfg.trigger.setAttribute("aria-expanded", "true");
    } else {
      const nextOpen = cfg.menu ? cfg.menu.hidden : false;
      if (cfg.menu) cfg.menu.hidden = !nextOpen;
      if (cfg.trigger) cfg.trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }
  };
  weightTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleGroupTrigger("weight");
  });
  volumeTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleGroupTrigger("volume");
  });
  lengthTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleGroupTrigger("length");
  });
  pieceTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeUnitMenus();
    applyPackUnit("pz");
  });
  packUnitSeg?.querySelectorAll(".prod-um-opt").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      applyPackUnit(opt.dataset.umVal);
      closeUnitMenus();
    });
  });

  if (packQtyInp) {
    selectAllOnFocus(packQtyInp);
    const commitPackQty = (fromBlur = false) => {
      if (packQtyInp.disabled) return true;
      const curPackUnit = packUnitInp?.value || "kg";
      const raw = packQtyInp.value.trim();
      if (!raw) {
        savedPackQty = "";
        lastConfezioneQty = "";
        packQtyInp.value = "";
      } else {
        const q = parseQty(raw);
        if (packQtyValid(q, curPackUnit)) {
          savedPackQty = formatPackQtyValue(q);
          lastConfezioneQty = savedPackQty;
          packQtyInp.value = savedPackQty;
          $("#reqPackQty")?.classList.remove("err");
          packQtyInp.classList.remove("invalid");
        } else if (!fromBlur) {
          showToast(isPiecePackUnit(curPackUnit) ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
          return false;
        } else {
          savedPackQty = raw;
          lastConfezioneQty = raw;
        }
      }
      packQtyBox?.classList.remove("editing");
      syncDescriptionPreview();
      if (!fromBlur) {
        packQtyInp.blur();
        releaseModalKeyboard();
      }
      return true;
    };
    const cancelPackQty = () => {
      packQtyInp.value = savedPackQty;
      lastConfezioneQty = savedPackQty;
      packQtyBox?.classList.remove("editing");
      syncDescriptionPreview();
      packQtyInp.blur();
      releaseModalKeyboard();
    };
    packQtyInp.addEventListener("focus", () => {
      if (packQtyInp.disabled) {
        packQtyInp.blur();
        return;
      }
      if (packQtyBox && !packQtyBox.classList.contains("editing")) savedPackQty = packQtyInp.value;
    });
    packQtyInp.addEventListener("input", () => {
      if (packQtyInp.disabled) return;
      if (packQtyBox && !packQtyBox.classList.contains("editing")) packQtyBox.classList.add("editing");
      lastConfezioneQty = packQtyInp.value;
      $("#reqPackQty")?.classList.remove("err");
      packQtyInp.classList.remove("invalid");
      syncDescriptionPreview();
    });
    packQtyNo?.addEventListener("mousedown", (e) => e.preventDefault());
    packQtyNo?.addEventListener("click", (e) => {
      e.preventDefault();
      cancelPackQty();
    });
    packQtyOk?.addEventListener("mousedown", (e) => e.preventDefault());
    packQtyOk?.addEventListener("click", (e) => {
      e.preventDefault();
      commitPackQty(false);
    });
    packQtyInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        commitPackQty(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelPackQty();
      }
    });
    packQtyInp.addEventListener("blur", () => {
      if (packQtyBox && packQtyBox.classList.contains("editing")) commitPackQty(true);
    });
  }

  formEl._applyDraft = (d) => {
    applyPackaging(d.packaging, d.packUnit);
    if (d.packaging === "confezione" && packQtyInp) {
      packQtyInp.value = d.packQty;
      savedPackQty = d.packQty;
      lastConfezioneQty = d.packQty;
      syncDescriptionPreview();
    }
  };

  const hasPositiveAddDisc = (v) => {
    if (!v) return false;
    const c = eurosFromInput(v);
    return c !== null && !Number.isNaN(c) && c > 0;
  };
  const syncAddDiscState = (isEditing) => {
    if (!addDiscInp || !addDiscBox) return;
    const active = !!addListCb?.checked;
    const editing = active && !!isEditing;
    addDiscBox.classList.toggle("editing", editing);
    const isPos = hasPositiveAddDisc(addDiscInp.value);
    addDiscInp.classList.toggle("has-positive", active && isPos);
    addDiscBox.classList.toggle("has-positive", active && isPos);
    const showClear = active && !editing && isPos;
    addDiscBox.classList.toggle("has-clear", showClear);
    if (addDiscClear) addDiscClear.hidden = !showClear;
  };

  const syncAddQtyRow = () => {
    if (!addListCb || !addQtyRow || !addQtyInp) return;
    const active = !!addListCb.checked;
    addListBox?.classList.toggle("is-active", active);
    addFieldsWrap?.classList.toggle("is-inactive", !active);
    if (addStoreTrigger) {
      addStoreTrigger.disabled = !active;
      addStoreTrigger.tabIndex = active ? 0 : -1;
      if (!active) addStoreTrigger.setAttribute("aria-expanded", "false");
    }
    if (!active && addStoreMenu) addStoreMenu.hidden = true;
    addQtyInp.disabled = !active;
    addQtyInp.readOnly = !active;
    addQtyInp.tabIndex = active ? 0 : -1;
    addQtyInp.setAttribute("aria-disabled", active ? "false" : "true");
    if (addQtyMinus) addQtyMinus.disabled = !active;
    if (addQtyPlus) addQtyPlus.disabled = !active;
    if (addDiscInp) {
      addDiscInp.disabled = !active;
      addDiscInp.readOnly = !active;
      addDiscInp.tabIndex = active ? 0 : -1;
      addDiscInp.setAttribute("aria-disabled", active ? "false" : "true");
      if (!active && document.activeElement === addDiscInp) addDiscInp.blur();
    }
    if (!active) {
      addQtyBox?.classList.remove("editing");
      if (document.activeElement === addQtyInp) addQtyInp.blur();
    }
    syncAddDiscState(false);
  };
  if (addListCb && addQtyInp) {
    syncAddQtyRow();
    if (addListBox) fitStoreChipLabels(addListBox);
    addListCb.addEventListener("change", () => {
      const curUnit = currentSalesUnit();
      if (addListCb.checked && (!addQtyInp.value.trim() || !qtyValid(parseQty(addQtyInp.value), curUnit))) {
        addQtyInp.value = fmtQtyUnit(1, curUnit);
        savedAddQty = addQtyInp.value;
      }
      syncAddQtyRow();
    });
    selectAllOnFocus(addQtyInp);
    const startAddQtyEdit = () => {
      if (!addListCb.checked || addQtyInp.disabled) {
        addQtyInp.blur();
        return;
      }
      if (!addQtyBox || addQtyBox.classList.contains("editing")) return;
      savedAddQty = addQtyInp.value;
      addQtyBox.classList.add("editing");
    };
    const commitAddQty = (fromBlur = false) => {
      const curUnit = currentSalesUnit();
      const raw = addQtyInp.value.trim();
      const q = parseQty(raw);
      if (qtyValid(q, curUnit)) {
        savedAddQty = fmtQtyUnit(q, curUnit);
        addQtyInp.value = savedAddQty;
      } else if (!fromBlur) {
        showToast(curUnit === "pz" || curUnit === "pz." ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
        return false;
      } else {
        savedAddQty = raw;
      }
      addQtyBox?.classList.remove("editing");
      if (!fromBlur) {
        addQtyInp.blur();
        releaseModalKeyboard();
      }
      return true;
    };
    const cancelAddQty = () => {
      addQtyInp.value = savedAddQty;
      addQtyBox?.classList.remove("editing");
      addQtyInp.blur();
      releaseModalKeyboard();
    };
    addQtyInp.addEventListener("focus", startAddQtyEdit);
    addQtyInp.addEventListener("click", startAddQtyEdit);
    addQtyNo?.addEventListener("mousedown", (e) => e.preventDefault());
    addQtyNo?.addEventListener("click", (e) => {
      e.preventDefault();
      cancelAddQty();
    });
    addQtyOk?.addEventListener("mousedown", (e) => e.preventDefault());
    addQtyOk?.addEventListener("click", (e) => {
      e.preventDefault();
      commitAddQty(false);
    });
    addQtyInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        commitAddQty(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelAddQty();
      }
    });
    addQtyInp.addEventListener("blur", () => {
      if (addQtyBox && addQtyBox.classList.contains("editing")) {
        commitAddQty(true);
      }
    });
    addQtyMinus?.addEventListener("click", () => {
      if (!addListCb.checked) return;
      const curUnit = currentSalesUnit();
      const q = parseQty(addQtyInp.value) || 1;
      const next = fmtQtyUnit(quantityStepValue(q, curUnit, -1), curUnit);
      addQtyInp.value = next;
      savedAddQty = next;
      addQtyBox?.classList.remove("editing");
    });
    addQtyPlus?.addEventListener("click", () => {
      if (!addListCb.checked) return;
      const curUnit = currentSalesUnit();
      const q = parseQty(addQtyInp.value) || 0;
      const next = fmtQtyUnit(quantityStepValue(q, curUnit, 1), curUnit);
      addQtyInp.value = next;
      savedAddQty = next;
      addQtyBox?.classList.remove("editing");
    });
    if (addDiscInp) {
      selectAllOnFocus(addDiscInp);
      const startAddDiscEdit = () => {
        if (!addListCb.checked || addDiscInp.disabled) {
          addDiscInp.blur();
          return;
        }
        if (!addDiscBox || addDiscBox.classList.contains("editing")) return;
        savedAddDisc = addDiscInp.value;
        syncAddDiscState(true);
      };
      const commitAddDisc = (fromBlur = false) => {
        const val = addDiscInp.value.trim();
        if (!val) {
          savedAddDisc = "";
          addDiscInp.value = "";
          syncAddDiscState(false);
          if (!fromBlur) {
            addDiscInp.blur();
            releaseModalKeyboard();
          }
          return true;
        }
        const cents = eurosFromInput(val);
        if (Number.isNaN(cents)) {
          if (!fromBlur) {
            showToast("Controlla il prezzo scontato inserito.");
            return false;
          }
          addDiscInp.value = savedAddDisc;
          syncAddDiscState(false);
          return false;
        }
        if (cents <= 0) {
          savedAddDisc = "";
          addDiscInp.value = "";
        } else {
          savedAddDisc = (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
          addDiscInp.value = savedAddDisc;
        }
        syncAddDiscState(false);
        if (!fromBlur) {
          addDiscInp.blur();
          releaseModalKeyboard();
        }
        return true;
      };
      const cancelAddDisc = () => {
        addDiscInp.value = hasPositiveAddDisc(savedAddDisc) ? savedAddDisc : "";
        syncAddDiscState(false);
        addDiscInp.blur();
        releaseModalKeyboard();
      };
      addDiscInp.addEventListener("focus", startAddDiscEdit);
      addDiscInp.addEventListener("click", startAddDiscEdit);
      addDiscInp.addEventListener("input", () => {
        const isPos = hasPositiveAddDisc(addDiscInp.value);
        addDiscInp.classList.toggle("has-positive", isPos);
        addDiscBox?.classList.toggle("has-positive", isPos);
      });
      addDiscClear?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      addDiscClear?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!addListCb.checked) return;
        savedAddDisc = "";
        addDiscInp.value = "";
        syncAddDiscState(false);
        addDiscInp.blur();
      });
      addDiscNo?.addEventListener("mousedown", (e) => e.preventDefault());
      addDiscNo?.addEventListener("click", (e) => {
        e.preventDefault();
        cancelAddDisc();
      });
      addDiscOk?.addEventListener("mousedown", (e) => e.preventDefault());
      addDiscOk?.addEventListener("click", (e) => {
        e.preventDefault();
        commitAddDisc(false);
      });
      addDiscInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          commitAddDisc(false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelAddDisc();
        }
      });
      addDiscInp.addEventListener("blur", () => {
        if (addDiscBox && addDiscBox.classList.contains("editing")) commitAddDisc(true);
      });
    }
  }
  let currentSelectedCat = selectedCategory;
  $("#prodCategory").addEventListener("change", () => {
    const val = $("#prodCategory").value;
    if (val !== "__new__") currentSelectedCat = val;
    $("#reqCat")?.classList.remove("err");
    $("#prodCategoryTrigger")?.classList.remove("invalid");
  });
  $("#prodCategory").addEventListener("change", async (e) => {
    if (e.target.value === "__new__") {
      setDropdownValue("prodCategory", currentSelectedCat);
      const draft = {
        itemName: itemNameInp?.value ?? "",
        brand: brandInp?.value ?? "",
        packaging: packInp?.value || "confezione",
        packUnit: packUnitInp?.value || "kg",
        packQty: packInp?.value === "sfuso" ? lastConfezioneQty : (packQtyInp?.value ?? ""),
        categoryId: currentSelectedCat,
        addToList: !!$("#addNewProdToList")?.checked,
        addStore: $("#addNewProdStore")?.value ?? "",
        addQty: $("#addNewProdQty")?.value ?? "",
        addDiscount: $("#addNewProdDiscount")?.value ?? "",
        stores: [...$("#modalRoot").querySelectorAll("[data-store-check]")].map((cb) => ({ id: cb.dataset.storeCheck, checked: cb.checked, price: $("#price-" + cb.dataset.storeCheck)?.value ?? "" }))
      };
      const reopenProduct = async (cat) => {
        await openProductForm(productId, returnPage, returnCategoryId, returnFn, cat?.id || draft.categoryId || null);
        const ni = $("#prodItemName"), bi = $("#prodBrand");
        if (ni) {
          ni.value = draft.itemName;
          ni._setInitial?.(draft.itemName);
          ni.dispatchEvent(new Event("input"));
        }
        if (bi) {
          bi.value = draft.brand.toLocaleUpperCase("it");
          bi._setInitial?.(bi.value);
          bi.dispatchEvent(new Event("input"));
        }
        $("#productForm")?._applyDraft?.(draft);
        if (draft.addStore !== undefined && $("#addNewProdStore")) {
          setDropdownValue("addNewProdStore", draft.addStore);
        }
        const addQ = $("#addNewProdQty");
        if (addQ && draft.addQty) addQ.value = draft.addQty;
        const addD = $("#addNewProdDiscount");
        if (addD && draft.addDiscount) addD.value = draft.addDiscount;
        const addCb = $("#addNewProdToList");
        if (addCb) {
          addCb.checked = !!draft.addToList;
          addCb.dispatchEvent(new Event("change"));
        }
        draft.stores.forEach((x) => {
          const cb = $(`#modalRoot [data-store-check="${x.id}"]`), field = $("#priceField-" + x.id), input = $("#price-" + x.id);
          if (cb) {
            cb.checked = x.checked;
            field?.classList.toggle("hidden", !x.checked);
          }
          if (input) input.value = x.price;
        });
        setDropdownValue("prodCategory", cat?.id || draft.categoryId || "");
        fitStoreChipLabels($("#productStoreFields"));
        if ($("#addNewProdListBox")) fitStoreChipLabels($("#addNewProdListBox"));
      };
      await createCategoryInline(async (cat) => reopenProduct(cat), async () => reopenProduct(null));
    }
  });
  $("#modalRoot").querySelectorAll("[data-store-check]").forEach((cb) => cb.addEventListener("change", () => {
    $("#priceField-" + cb.dataset.storeCheck).classList.toggle("hidden", !cb.checked);
    fitStoreChipLabels(cb.closest(".store-price-row"));
  }));
  fitStoreChipLabels($("#productStoreFields"));
  $("#modalRoot").querySelectorAll(".price-input").forEach((inp) => {
    const box = inp.closest(".name-box");
    const noBtn = box?.querySelector(".name-no");
    const okBtn = box?.querySelector(".name-ok");
    let savedVal = inp.value.trim();
    selectAllOnFocus(inp);
    const formatIfValid = () => {
      const val = inp.value.trim();
      if (!val) {
        inp.value = "";
        return true;
      }
      const c = eurosFromInput(val);
      if (Number.isNaN(c)) return false;
      if (c !== null) {
        const formatted = (c / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
        if (formatted.length <= 8) inp.value = formatted;
      }
      return true;
    };
    const startEdit = () => {
      if (!box || box.classList.contains("editing")) return;
      savedVal = inp.value;
      box.classList.add("editing");
    };
    const commit = (fromBlur = false) => {
      if (!formatIfValid()) {
        if (!fromBlur) showToast("Controlla il prezzo inserito.");
        else {
          inp.value = savedVal;
          box?.classList.remove("editing");
        }
        return false;
      }
      savedVal = inp.value;
      box?.classList.remove("editing");
      if (!fromBlur) {
        inp.blur();
        releaseModalKeyboard();
      }
      return true;
    };
    const cancel = () => {
      inp.value = savedVal;
      box?.classList.remove("editing");
      inp.blur();
      releaseModalKeyboard();
    };
    inp.addEventListener("focus", startEdit);
    inp.addEventListener("click", startEdit);
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
      if (box && box.classList.contains("editing")) commit(true);
    });
  });
  void itemNameDec;
  void brandDec;
}

export async function createCategoryInline(onCreated, onCancelled = () => openProductForm(state.editingProductId, state.productReturnPage, state.productReturnCategoryId, state.productReturnFn)) {
  const cancel = async () => {
    state.currentModal = null;
    state.currentModalKeep = false;
    await onCancelled();
  };
  modal("Nuovo reparto", '<div class="field"><label for="newCatName">Nome reparto <span class="label-hint">(max 25 caratteri)</span></label><input id="newCatName" type="text" maxlength="25" placeholder="Es. ORTOFRUTTA" autocapitalize="characters"></div>', [
    { label: "Annulla", class: "btn-plain", action: cancel },
    { label: "Salva", class: "btn-primary", action: async () => {
      const name = $("#newCatName").value.trim().toLocaleUpperCase("it");
      if (!name) {
        showToast("Inserisci il nome del reparto.");
        return;
      }
      if (name.length > 25) {
        showToast("Il nome del reparto pu\xF2 contenere al massimo 25 caratteri.");
        return;
      }
      if ((await getAll("categories")).some((c2) => c2.nameNormalized === norm(name))) {
        showToast("Esiste gi\xE0 un reparto con questo nome.");
        return;
      }
      const c = { id: uuid(), name, nameNormalized: norm(name), createdAt: now(), updatedAt: now() };
      await putOne("categories", c);
      state.currentModal = null;
      state.currentModalKeep = false;
      await onCreated(c);
      showToast("Reparto creato");
    } }
  ], { closeButton: false, backdropClose: false, keepModalOnClose: true, onClose: onCancelled, alignTop: true, themed: true });
  forceUppercaseInput($("#newCatName"));
}

export async function saveProductForm(productId, returnPage, returnCategoryId = null) {
  $("#prodBrand")?._commitSuggestion?.();
  const itemName = ($("#prodItemName")?.value || "").trim().replace(/\s+/g, " ");
  const brand = ($("#prodBrand")?.value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("it");
  const packaging = $("#prodPackaging")?.value || "confezione";
  const packUnit = $("#prodPackUnit")?.value || "kg";
  const packQtyRaw = packaging === "sfuso" ? (isPiecePackUnit(packUnit) ? "1" : "1,000") : ($("#prodPackQty")?.value || "").trim();
  const packQty = packaging === "sfuso" ? 1 : parseQty(packQtyRaw);
  const categoryId = $("#prodCategory")?.value || "";
  const addToList = !productId && !!$("#addNewProdToList")?.checked;

  const itemNameMiss = !itemName;
  const itemNameOver = itemName.length > PROD_NAME_MAX;
  const brandOver = brand.length > PROD_BRAND_MAX;
  const packMiss = packaging !== "confezione" && packaging !== "sfuso";
  const allowedUnits = packaging === "sfuso" ? PROD_SFUSO_UNITS : PROD_CONFEZIONE_UNITS;
  const packUnitMiss = !allowedUnits.includes(packUnit);
  const packQtyEmpty = packaging !== "sfuso" && !packQtyRaw;
  const packQtyBad = packaging !== "sfuso" && !packQtyEmpty && !packQtyValid(packQty, packUnit);
  const catMiss = !categoryId || categoryId === "__new__";

  if (catMiss || itemNameMiss || itemNameOver || brandOver || packMiss || packUnitMiss || packQtyEmpty || packQtyBad) {
    $("#reqCat")?.classList.toggle("err", catMiss);
    $("#prodCategoryTrigger")?.classList.toggle("invalid", catMiss);
    $("#reqItemName")?.classList.toggle("err", itemNameMiss || itemNameOver);
    $("#prodItemName")?.classList.toggle("invalid", itemNameMiss || itemNameOver);
    $("#prodBrand")?.classList.toggle("invalid", brandOver);
    $("#prodPackagingSeg")?.classList.toggle("invalid", packMiss);
    $("#prodPackUnitSeg")?.classList.toggle("invalid", packUnitMiss);
    $("#reqPackQty")?.classList.toggle("err", packUnitMiss || packQtyEmpty || packQtyBad);
    $("#prodPackQty")?.classList.toggle("invalid", packQtyEmpty || packQtyBad);
    const scrollEl = $("#modalRoot .modal-scroll-body") || $("#modalRoot .modal");
    const firstErrEl = catMiss ? $("#prodCategoryTrigger") : (itemNameMiss || itemNameOver) ? $("#prodItemName") : brandOver ? $("#prodBrand") : packMiss ? $("#prodPackagingSeg") : packUnitMiss ? $("#prodPackUnitSeg") : $("#prodPackQty");
    if (firstErrEl && scrollEl) {
      firstErrEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (!catMiss && (itemNameMiss || itemNameOver)) $("#prodItemName")?.focus({ preventScroll: true });
    else if (!catMiss && !itemNameMiss && !itemNameOver && brandOver) $("#prodBrand")?.focus({ preventScroll: true });
    else if (!catMiss && !itemNameMiss && !itemNameOver && !brandOver && (packQtyEmpty || packQtyBad)) $("#prodPackQty")?.focus({ preventScroll: true });
    if (itemNameOver) {
      showToast(`Il nome pu\xF2 contenere al massimo ${PROD_NAME_MAX} caratteri.`);
    } else if (brandOver) {
      showToast(`La marca pu\xF2 contenere al massimo ${PROD_BRAND_MAX} caratteri.`);
    } else if (packQtyBad) {
      showToast(isPiecePackUnit(packUnit) ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
    } else {
      showToast("Compila tutti i campi obbligatori.");
    }
    return;
  }

  const name = composeProductDescription(itemName, brand, packQty, packUnit, true, packaging);
  if (!name) {
    showToast("Compila tutti i campi obbligatori.");
    return;
  }

  const unit = salesUnitForPackaging(packaging, packUnit);
  let addQty = 1;
  let addDiscountUnitMinor = null;
  if (addToList) {
    const qtyEl = $("#addNewProdQty");
    const rawQty = qtyEl ? qtyEl.value.trim() : "1";
    addQty = rawQty === "" ? 1 : parseQty(rawQty);
    if (!qtyValid(addQty, unit)) {
      showToast(unit === "pz" || unit === "pz." ? "Inserisci una quantit\xE0 intera positiva." : "Inserisci una quantit\xE0 positiva con massimo 3 decimali.");
      qtyEl?.focus();
      return;
    }
    const discEl = $("#addNewProdDiscount");
    const rawDisc = discEl ? discEl.value.trim() : "";
    const discMinor = eurosFromInput(rawDisc);
    if (Number.isNaN(discMinor)) {
      showToast("Controlla il prezzo scontato inserito.");
      discEl?.focus();
      return;
    }
    addDiscountUnitMinor = discMinor !== null && discMinor > 0 ? discMinor : null;
  }
  const products = await getAll("products");
  if (products.some((x) => x.id !== productId && x.nameNormalized === norm(name))) {
    showToast("Articolo gi\xE0 presente.");
    return;
  }
  const selected = [...$("#modalRoot").querySelectorAll("[data-store-check]:checked")].map((x) => x.dataset.storeCheck), priceRecords = [];
  for (const sid of selected) {
    const v = $("#price-" + sid)?.value ?? "", amount = eurosFromInput(v);
    if (Number.isNaN(amount)) {
      showToast("Controlla il prezzo inserito.");
      return;
    }
    if (amount !== null) priceRecords.push({ storeId: sid, amountMinor: amount });
  }
  const existing = productId ? await getOne("products", productId) : null;
  const prod = {
    id: productId || uuid(),
    name,
    nameNormalized: norm(name),
    itemName,
    brand,
    packaging,
    packUnit,
    packQty: Math.round(packQty * 1e3) / 1e3,
    categoryId,
    unit,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  };
  const [existingAssociations, existingPrices, existingListItems, existingSavedLists] = await Promise.all([
    getAll("productStores"),
    getAll("productPrices"),
    productId ? getAll("shoppingListItems") : Promise.resolve([]),
    productId ? getAll("savedLists") : Promise.resolve([])
  ]);
  const txStores = productId ? ["products", "productStores", "productPrices", "shoppingListItems", "savedLists"] : ["products", "productStores", "productPrices"];
  const tx = state.db.transaction(txStores, "readwrite");
  tx.objectStore("products").put(prod);
  const ps = tx.objectStore("productStores"), pp = tx.objectStore("productPrices");
  for (const x of existingAssociations) if (x.productId === prod.id) ps.delete(x.id);
  for (const x of existingPrices) if (x.productId === prod.id) pp.delete(x.id);
  for (const sid of selected) ps.put({ id: uuid(), productId: prod.id, storeId: sid, createdAt: now() });
  for (const pr of priceRecords) pp.put({ id: uuid(), productId: prod.id, storeId: pr.storeId, amountMinor: pr.amountMinor, currency: "EUR", updatedAt: now() });
  if (productId && unit === "pz") {
    const sli = tx.objectStore("shoppingListItems");
    for (const it of existingListItems) {
      if (it.productId === prod.id && !Number.isInteger(it.quantity)) {
        const nextQty = Math.max(1, Math.round(it.quantity));
        const nextManualAmt = it.manualUnitPriceMinor !== undefined && it.manualUnitPriceMinor !== null
          ? Math.round(it.manualUnitPriceMinor * nextQty)
          : it.manualAmountMinor;
        sli.put({ ...it, quantity: nextQty, manualAmountMinor: nextManualAmt, updatedAt: now() });
      }
    }
    const sls = tx.objectStore("savedLists");
    for (const sl of existingSavedLists) {
      let changed = false;
      const nextItems = (sl.items || []).map((it) => {
        if (it.productId === prod.id && !Number.isInteger(it.quantity)) {
          changed = true;
          const nextQty = Math.max(1, Math.round(it.quantity));
          const nextManualAmt = it.manualUnitPriceMinor !== undefined && it.manualUnitPriceMinor !== null
            ? Math.round(it.manualUnitPriceMinor * nextQty)
            : it.manualAmountMinor;
          return { ...it, quantity: nextQty, manualAmountMinor: nextManualAmt };
        }
        return it;
      });
      if (changed) sls.put({ ...sl, items: nextItems, updatedAt: now() });
    }
  }
  await txDone(tx);
  if (addToList) {
    const addStoreEl = $("#addNewProdStore");
    let targetStoreId = null;
    if (addStoreEl) {
      targetStoreId = addStoreEl.value || null;
    } else {
      const st = await settings();
      if (st.defaultStoreId && selected.includes(st.defaultStoreId)) targetStoreId = st.defaultStoreId;
      else if (selected.length === 1) targetStoreId = selected[0];
      else targetStoreId = st.defaultStoreId || null;
    }
    const manualAmountMinor = addDiscountUnitMinor !== null ? Math.round(addDiscountUnitMinor * addQty) : null;
    await actuallyAddItem(prod.id, targetStoreId, addQty, manualAmountMinor, addDiscountUnitMinor);
  }
  const addedMsg = addToList ? "Articolo aggiunto e inserito nella lista" : "Articolo aggiunto";
  if (returnPage === "addItem") {
    state.currentModal = null;
    state.currentModalKeep = false;
    await openAddItem();
    showToast(productId ? "Articolo salvato" : addedMsg);
  } else if (returnPage === "editor") {
    state.currentModal = null;
    state.currentModalKeep = false;
    await state.productReturnFn();
    showToast("Articolo salvato");
  } else if (returnPage === "categoryDetail") {
    state.currentModal = null;
    state.currentModalKeep = false;
    await openCategoryForm(returnCategoryId, true);
    showToast("Articolo salvato");
  } else if (returnPage === "categoryPicker") {
    state.currentModal = null;
    state.currentModalKeep = false;
    await openCategoryProductPicker(returnCategoryId);
    showToast(productId ? "Articolo salvato" : addedMsg);
  } else {
    closeModal(false);
    if (returnPage === "list" && !productId) {
      if (addToList) {
        await renderList();
        showToast(addedMsg);
      } else {
        await openNewListItemEditor(prod.id);
      }
    } else if (returnPage === "list") {
      await openAddItem();
      showToast("Articolo aggiornato");
    } else if (returnPage === "categories") {
      await renderCategories();
      showToast("Articolo salvato");
    } else if (!productId && returnPage === "products") {
      await openProductForm(null, "products", null, null, categoryId);
      showToast(addedMsg);
    } else {
      state.page = "products";
      await render();
      showToast("Articolo salvato");
    }
  }
}

export async function deleteProduct(productId, returnCategoryId = null) {
  const [associations, prices, items] = await Promise.all([getAll("productStores"), getAll("productPrices"), getAll("shoppingListItems")]);
  const tx = state.db.transaction(["products", "productStores", "productPrices", "shoppingListItems", "tombstones"], "readwrite");
  tx.objectStore("products").delete(productId);
  for (const x of associations) if (x.productId === productId) tx.objectStore("productStores").delete(x.id);
  for (const x of prices) if (x.productId === productId) tx.objectStore("productPrices").delete(x.id);
  for (const x of items) if (x.productId === productId) tx.objectStore("shoppingListItems").delete(x.id);
  tx.objectStore("tombstones").put({ id: uuid(), entityType: "product", entityId: productId, deletedAt: now(), revision: Date.now() });
  await txDone(tx);
  if (returnCategoryId) {
    await openCategoryForm(returnCategoryId);
  } else {
    state.page = "products";
    await render();
  }
  showToast("Articolo eliminato");
}
