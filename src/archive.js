// Archivio spese (scontrini immutabili), aggiunte/detrazioni cassa e riepilogo risparmio
import { state } from "./state.js";
import { SVG_CHK, SVG_CIRCLED_PLUS, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, assignUnit, displayUnit, esc, eurosFromInput, extractProductFields, fmtQtyUnit, money, moneyPerUnit, norm, now, productDisplayParts, searchNorm, storeChipHtml, storeHasColors, uuid } from "./calculations.js";
import { activeItems, delOne, getAll, getOne, putOne, txDone } from "./storage.js";
import { attachSearchClear, bindSwipeDelete, closeModal, confirmDialog, modal, releaseModalKeyboard, selectAllOnFocus, showToast, showUndoToast, singleFilterHtml, swipeWrap, updateSingleFilterUI, wireSingleFilter } from "./ui.js";
import { currentSavedListId } from "./history.js";
import { openListMenu } from "./shoppingList.js";

const RECEIPT_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 2.5h15v19l-2.5-1.7-2.5 1.7-2.5-1.7-2.5 1.7-2.5-1.7-2.5 1.7v-19Z" fill="#ffffff" stroke="#174f86" stroke-width="1.5" stroke-linejoin="round"/><rect x="4.5" y="2.5" width="15" height="4.2" fill="#2f6db5"/><path d="M8 10h8M8 13.3h6.5M8 16.5h4.2" stroke="#174f86" stroke-width="1.55" stroke-linecap="round"/><circle cx="17.2" cy="16.2" r="3.6" fill="#159447" stroke="#ffffff" stroke-width="1.2"/><path d="M15.7 16.2l1 1 2.1-2.2" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SCONTRINO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.6 7.3 4.2 9.6 2.6 12 4.2 14.4 2.6 16.7 4.2 19 2.6v18.8l-2.3-1.6-2.3 1.6L12 19.8l-2.4 1.6-2.3-1.6L5 21.4V2.6Z" fill="#ffffff" stroke="#123e6d" stroke-width="1.45" stroke-linejoin="round"/><path d="M8 8.2h5.2M15.2 8.2h.8M8 11.4h4.4M14.4 11.4h1.6M8 14.6h8" stroke="#174f86" stroke-width="1.45" stroke-linecap="round"/><path d="M8 17.3h3.2M13.6 17.3h2.4" stroke="#159447" stroke-width="1.75" stroke-linecap="round"/></svg>';
const CALENDAR_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="archive-cal-svg"><rect x="2.75" y="4.75" width="18.5" height="16.5" rx="2.6" fill="#ffffff" stroke="#174f86" stroke-width="1.5"/><path d="M2.75 7.35A2.6 2.6 0 0 1 5.35 4.75h13.3a2.6 2.6 0 0 1 2.6 2.6V9.6H2.75V7.35Z" fill="#d93829" stroke="#174f86" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.6 2.4v4M16.4 2.4v4" stroke="#174f86" stroke-width="2" stroke-linecap="round"/><rect x="6" y="12" width="2.7" height="2.4" rx=".5" fill="#7c98b6"/><rect x="10.65" y="12" width="2.7" height="2.4" rx=".5" fill="#7c98b6"/><rect x="15.3" y="12" width="2.7" height="2.4" rx=".5" fill="#7c98b6"/><rect x="6" y="16" width="2.7" height="2.4" rx=".5" fill="#7c98b6"/><rect x="10.65" y="16" width="2.7" height="2.4" rx=".5" fill="#d93829"/><rect x="15.3" y="16" width="2.7" height="2.4" rx=".5" fill="#7c98b6"/></svg>';

const ADJUSTMENT_PRESETS = {
  add: ["Sacchetti BIO", "Borse", "Cauzioni", "Contributo premi", "Arrotondamento", "Consegna"],
  deduct: ["Buoni fedelt\xE0", "Buoni pasto", "Resi", "Sconto generale", "Arrotondamento"]
};

function sanitizeReceiptAmountInput(raw) {
  const s = String(raw ?? "").replace(/\./g, ",").replace(/[^0-9,]/g, "");
  const commaIdx = s.indexOf(",");
  if (commaIdx !== -1) {
    const intPart = s.slice(0, commaIdx).slice(0, 4);
    const decPart = s.slice(commaIdx + 1).replace(/,/g, "").slice(0, 2);
    return `${intPart},${decPart}`;
  }
  return s.slice(0, 4);
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtIsoDate(isoDate, fallbackIsoTs) {
  if (typeof isoDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(fallbackIsoTs || Date.now());
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function receiptStoreChip(receipt, extraClass = "") {
  if (!receipt.storeId && (!receipt.storeNameSnapshot || receipt.storeNameSnapshot === "Senza supermercato")) {
    return '<span class="it">Senza supermercato</span>';
  }
  const virtualStore = {
    name: receipt.storeNameSnapshot || "Supermercato",
    bgColor: receipt.storeBgColorSnapshot || null,
    textColor: receipt.storeTextColorSnapshot || null
  };
  return storeChipHtml(virtualStore, { className: extraClass || "archive-store-chip", defaultBold: true });
}

export function computeReceiptTotals(receipt) {
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  const adjustments = Array.isArray(receipt?.adjustments) ? receipt.adjustments : [];
  let itemsSubtotalMinor = 0;
  let listTotalMinor = 0;
  let promoSavingsMinor = 0;
  let missingPricesCount = 0;
  let hasListBaseline = false;

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const lineTotal = Number.isFinite(it.lineTotalMinor) ? it.lineTotalMinor : 0;
    itemsSubtotalMinor += lineTotal;
    if (it.priceMissing || it.effectiveUnitPriceMinor === null || it.effectiveUnitPriceMinor === undefined) {
      missingPricesCount++;
    }
    const hasList = it.listUnitPriceMinor !== null && it.listUnitPriceMinor !== undefined;
    if (hasList) {
      hasListBaseline = true;
      const listLine = Number.isFinite(it.listLineTotalMinor) ? it.listLineTotalMinor : Math.round(it.listUnitPriceMinor * qty);
      listTotalMinor += listLine;
      if (!it.priceMissing && it.effectiveUnitPriceMinor !== null && it.effectiveUnitPriceMinor !== undefined) {
        promoSavingsMinor += (listLine - lineTotal);
      }
    } else {
      listTotalMinor += lineTotal;
    }
  }

  let additionsMinor = 0;
  let deductionsMinor = 0;
  for (const adj of adjustments) {
    const amt = Math.max(0, Number(adj.amountMinor) || 0);
    if (adj.type === "add") additionsMinor += amt;
    else if (adj.type === "deduct") deductionsMinor += amt;
  }

  const finalTotalMinor = itemsSubtotalMinor + additionsMinor - deductionsMinor;
  const totalSavingsMinor = promoSavingsMinor + deductionsMinor;
  const netDiffVsListMinor = listTotalMinor - finalTotalMinor;
  const savingsPct = listTotalMinor > 0 ? Math.round((netDiffVsListMinor / listTotalMinor) * 1000) / 10 : 0;

  return {
    itemsCount: items.length,
    itemsSubtotalMinor,
    additionsMinor,
    deductionsMinor,
    finalTotalMinor,
    listTotalMinor,
    promoSavingsMinor,
    totalSavingsMinor,
    netDiffVsListMinor,
    savingsPct,
    missingPricesCount,
    hasListBaseline
  };
}

function resolveActiveItemPricing(item, priceLookup, quickUnitMinor = null) {
  const qty = Number(item.quantity) || 0;
  const pr = item.storeId ? priceLookup.get(`${item.productId}|${item.storeId}`) : null;
  const listUnitPriceMinor = pr ? pr.amountMinor : null;
  const listLineTotalMinor = listUnitPriceMinor !== null ? Math.round(listUnitPriceMinor * qty) : null;

  if (quickUnitMinor !== null && !Number.isNaN(quickUnitMinor)) {
    const lineTotalMinor = Math.round(quickUnitMinor * qty);
    return {
      listUnitPriceMinor: listUnitPriceMinor !== null ? listUnitPriceMinor : quickUnitMinor,
      effectiveUnitPriceMinor: quickUnitMinor,
      lineTotalMinor,
      listLineTotalMinor: listLineTotalMinor !== null ? listLineTotalMinor : lineTotalMinor,
      isPromo: listUnitPriceMinor !== null && quickUnitMinor !== listUnitPriceMinor,
      priceMissing: false
    };
  }

  if (item.manualUnitPriceMinor !== undefined && item.manualUnitPriceMinor !== null) {
    const eff = item.manualUnitPriceMinor;
    const lineTotalMinor = Math.round(eff * qty);
    return {
      listUnitPriceMinor,
      effectiveUnitPriceMinor: eff,
      lineTotalMinor,
      listLineTotalMinor,
      isPromo: listUnitPriceMinor !== null ? eff !== listUnitPriceMinor : true,
      priceMissing: false
    };
  }

  if (item.manualAmountMinor !== undefined && item.manualAmountMinor !== null) {
    const lineTotalMinor = item.manualAmountMinor;
    const eff = qty > 0 ? Math.round(lineTotalMinor / qty) : null;
    return {
      listUnitPriceMinor,
      effectiveUnitPriceMinor: eff,
      lineTotalMinor,
      listLineTotalMinor,
      isPromo: listLineTotalMinor !== null ? lineTotalMinor !== listLineTotalMinor : true,
      priceMissing: false
    };
  }

  if (listUnitPriceMinor !== null) {
    return {
      listUnitPriceMinor,
      effectiveUnitPriceMinor: listUnitPriceMinor,
      lineTotalMinor: listLineTotalMinor,
      listLineTotalMinor,
      isPromo: false,
      priceMissing: false
    };
  }

  return {
    listUnitPriceMinor: null,
    effectiveUnitPriceMinor: null,
    lineTotalMinor: 0,
    listLineTotalMinor: null,
    isPromo: false,
    priceMissing: true
  };
}

function buildReceiptSnapshot({ storeObj, storeId, itemsToArchive, purchaseDate, note, sourceListName, quickPricesMap, pMap, cMap, priceLookup, routes = [] }) {
  const ts = now();
  const storeNameSnapshot = storeObj ? storeObj.name : "Senza supermercato";
  const routePosition = (sid, catId) => {
    if (!sid || !catId) return 99999;
    return routes.find((r) => r.storeId === sid && r.categoryId === catId)?.position ?? 99999;
  };
  const orderedItems = [...itemsToArchive].sort((a, b) => {
    const pa = pMap[a.productId], pb = pMap[b.productId];
    if (!pa || !pb) return 0;
    if (storeId) {
      const d = routePosition(storeId, pa.categoryId) - routePosition(storeId, pb.categoryId);
      if (d) return d;
    }
    return (cMap[pa.categoryId]?.name || "").localeCompare(cMap[pb.categoryId]?.name || "", "it", { sensitivity: "base" }) ||
      (pa.name || "").localeCompare(pb.name || "", "it", { sensitivity: "base" });
  });

  const snapshotItems = orderedItems.map((item) => {
    const p = pMap[item.productId];
    const dp = productDisplayParts(p);
    const cat = p?.categoryId ? cMap[p.categoryId] : null;
    const quickPrice = quickPricesMap.has(item.id) ? quickPricesMap.get(item.id) : null;
    const pricing = resolveActiveItemPricing(item, priceLookup, quickPrice);
    return {
      productId: item.productId,
      productNameSnapshot: dp.title || p?.name || "Articolo",
      productBrandSnapshot: dp.brand || "",
      categoryId: p?.categoryId || null,
      categoryNameSnapshot: cat?.name || "Senza reparto",
      unitSnapshot: p?.unit || "pz",
      packagingSnapshot: p?.packaging || extractProductFields(p).packaging,
      storeId: storeId || null,
      storeNameSnapshot,
      quantity: Number(item.quantity),
      listUnitPriceMinor: pricing.listUnitPriceMinor,
      effectiveUnitPriceMinor: pricing.effectiveUnitPriceMinor,
      lineTotalMinor: pricing.lineTotalMinor,
      listLineTotalMinor: pricing.listLineTotalMinor,
      isPromo: pricing.isPromo,
      priceMissing: pricing.priceMissing
    };
  });

  return {
    id: uuid(),
    schemaVersion: 1,
    itemsOrderedByList: true,
    archivedAt: ts,
    purchaseDate: purchaseDate || todayIsoDate(),
    storeId: storeId || null,
    storeNameSnapshot,
    storeBgColorSnapshot: storeObj?.bgColor || null,
    storeTextColorSnapshot: storeObj?.textColor || null,
    sourceListName: sourceListName || null,
    note: note ? note.trim() : "",
    currency: "EUR",
    items: snapshotItems,
    adjustments: [],
    updatedAt: ts
  };
}

function sortReceiptsDesc(list) {
  return [...list].sort((a, b) => {
    const da = String(a.purchaseDate || (a.archivedAt || "").slice(0, 10));
    const db = String(b.purchaseDate || (b.archivedAt || "").slice(0, 10));
    if (da !== db) return db.localeCompare(da);
    return String(b.archivedAt || "").localeCompare(String(a.archivedAt || ""));
  });
}

function receiptItemDisplayUnit(it) {
  if (it?.packagingSnapshot === "confezione") return "Cf";
  if (it?.packagingSnapshot === "sfuso") return assignUnit(it.unitSnapshot || "pz");
  const u = assignUnit(it?.unitSnapshot || "pz");
  if (u !== "pz") return u;
  if (/@(?:kg|g|lt|l|cl|ml|cm|m|pz\.?)(?=\s|$)/i.test(String(it?.productNameSnapshot || ""))) return "pz";
  return "Cf";
}

function formatReceiptItemNameHtml(name) {
  return esc(name).replace(/(@(?:kg|g|lt|l|cl|ml|cm|m|pz\.?))(?=\s|$)/gi, '<span class="desc-net-sfuso">$1</span>');
}

function renderReceiptItemRowHtml(it, opts = {}) {
  const dispUnit = receiptItemDisplayUnit(it);
  const qtyText = `${fmtQtyUnit(it.quantity, it.unitSnapshot)} ${esc(dispUnit)}`;
  const brandText = (it.productBrandSnapshot || "").trim();
  const brandHtml = brandText ? `<div class="row-brand receipt-item-brand">${esc(brandText)}</div>` : "";
  let unitPriceHtml = "";
  if (it.priceMissing || it.effectiveUnitPriceMinor === null || it.effectiveUnitPriceMinor === undefined) {
    unitPriceHtml = `<span class="receipt-item-nd">prezzo N/D</span>`;
  } else if (it.isPromo && it.listUnitPriceMinor !== null && it.listUnitPriceMinor !== undefined && it.listUnitPriceMinor !== it.effectiveUnitPriceMinor) {
    const discPct = it.listUnitPriceMinor > 0 && it.effectiveUnitPriceMinor < it.listUnitPriceMinor
      ? Math.round(((it.listUnitPriceMinor - it.effectiveUnitPriceMinor) / it.listUnitPriceMinor) * 100)
      : 0;
    const discBadgeHtml = discPct > 0 ? ` <span class="receipt-discount-badge">${discPct}%</span>` : "";
    unitPriceHtml = `<span class="receipt-item-unit-old">${moneyPerUnit(it.listUnitPriceMinor, dispUnit)}</span> <span class="receipt-item-unit-promo">${moneyPerUnit(it.effectiveUnitPriceMinor, dispUnit)}</span>${discBadgeHtml}`;
  } else {
    unitPriceHtml = `<span class="receipt-item-unit">${moneyPerUnit(it.effectiveUnitPriceMinor, dispUnit)}</span>`;
  }
  const totalHtml = it.priceMissing ? '<span class="is-nd">N/D</span>' : money(it.lineTotalMinor);
  const extraClass = opts.extraClass ? ` ${opts.extraClass}` : "";
  const dataAttr = opts.openReceiptId ? ` data-open-receipt="${esc(opts.openReceiptId)}"` : "";
  return `<div class="receipt-item-row${extraClass}"${dataAttr}>
    ${opts.topMetaHtml || ""}
    <div class="receipt-item-top">
      <span class="receipt-item-name">${formatReceiptItemNameHtml(it.productNameSnapshot)}</span>
    </div>
    ${brandHtml}
    <div class="receipt-item-bottom">
      <div class="receipt-item-meta">
        <div class="receipt-item-cat">${esc(it.categoryNameSnapshot || "Senza reparto")}</div>
        <div class="receipt-item-cat">${unitPriceHtml}</div>
      </div>
      <div class="receipt-item-amounts">
        <span class="receipt-item-qty">${qtyText}</span>
        <strong class="receipt-item-total">${totalHtml}</strong>
      </div>
    </div>
  </div>`;
}

export async function openArchiveWindow(opts = {}) {
  const [receiptsRaw, curItems, products] = await Promise.all([
    getAll("archivedReceipts"),
    activeItems(),
    getAll("products")
  ]);
  const pSet = new Set(products.map((p) => p.id));
  const validActiveItems = curItems.filter((i) => pSet.has(i.productId));
  const receipts = sortReceiptsDesc(receiptsRaw);

  let selectedStoreKey = opts.storeFilter || "all";
  let searchQuery = opts.searchQuery || "";

  const storeFilterMap = new Map();
  for (const r of receipts) {
    const key = r.storeNameSnapshot || "Senza supermercato";
    if (!storeFilterMap.has(key)) {
      storeFilterMap.set(key, {
        name: key,
        bgColor: r.storeBgColorSnapshot || null,
        textColor: r.storeTextColorSnapshot || null,
        isNone: !r.storeId && key === "Senza supermercato"
      });
    }
  }
  const storeNames = [...storeFilterMap.keys()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  if (selectedStoreKey !== "all" && !storeNames.includes(selectedStoreKey)) selectedStoreKey = "all";

  const storeFilterOptions = storeNames.map((name) => {
    const info = storeFilterMap.get(name);
    const html = info.isNone
      ? '<span style="font-style:italic">Senza supermercato</span>'
      : (storeHasColors(info) ? storeChipHtml(info) : "");
    return { id: name, label: name, html, disabled: false };
  });
  const allStoresLabel = "Tutti i supermercati";

  const filterBarHtml = receipts.length ? `
    <div class="archive-filter-sticky">
      <div class="archive-filter-bar">
        ${singleFilterHtml({ id: "archiveStoreFilter", allLabel: allStoresLabel, options: storeFilterOptions, selectedValue: selectedStoreKey })}
        <input id="archiveSearchInput" type="search" class="search-input" placeholder="Cerca articolo\u2026" value="${esc(searchQuery)}" autocomplete="off" aria-label="Cerca articolo nell'archivio spese">
      </div>
    </div>` : "";

  const body = `<div class="saved-lists-sheet archive-sheet">
    <div class="saved-name-card archive-cta-card">
      <button type="button" class="btn btn-primary btn-block" id="archiveCurrentBtn" ${validActiveItems.length ? "" : "disabled"}>
        ${SVG_CIRCLED_PLUS}<span>Archivia spesa corrente</span>
      </button>
    </div>
    ${filterBarHtml}
    <div class="saved-list-section has-section-banner">
      <div class="saved-list-head list-section-banner">
        <div class="saved-list-head-left">
          <span class="saved-list-icon archive-section-icon">${RECEIPT_ICON_SVG}</span>
          <span class="saved-list-title" id="archiveSectionTitle">Spese archiviate</span>
          <span class="title-count-badge" id="archiveCountBadge">${receipts.length}</span>
        </div>
        <button type="button" class="header-icon trash-mini" id="delAllArchivedBtn" ${receipts.length ? "" : "disabled"} aria-label="Elimina tutte le spese archiviate" title="Elimina tutte le spese archiviate">${TRASH_OFFICE}</button>
      </div>
      <div id="archivedReceiptsContainer"></div>
    </div>
  </div>`;

  modal("Archivio spese", body, [
    { label: "Chiudi", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openListMenu(); } }
  ], {
    closeButton: true,
    backdropClose: false,
    alignTop: true,
    keepModalOnClose: true,
    themed: true,
    onClose: () => openListMenu()
  });

  {
    const hh = $("#modalRoot .modal-header");
    hh.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Archivia la spesa corrente o clicca su una spesa archiviata per vederne i dettagli.<br>Scorri verso destra per eliminarla.<br>Puoi anche ricercare un articolo all'interno delle spese archiviate, per ricostruirne lo storico del prezzo.</div>`);
  }

  const container = $("#archivedReceiptsContainer");
  const countBadge = $("#archiveCountBadge");
  const searchInp = $("#archiveSearchInput");
  const delAllBtn = $("#delAllArchivedBtn");

  const getStoreFilteredReceipts = () => receipts.filter((r) => {
    const storeLabel = r.storeNameSnapshot || "Senza supermercato";
    return selectedStoreKey === "all" || storeLabel === selectedStoreKey;
  });

  const paintReceipts = () => {
    const q = searchNorm(searchQuery);
    const storeFiltered = getStoreFilteredReceipts();
    if (delAllBtn) {
      delAllBtn.disabled = storeFiltered.length === 0;
      const delLabel = selectedStoreKey === "all"
        ? "Elimina tutte le spese archiviate"
        : `Elimina le spese archiviate di ${selectedStoreKey}`;
      delAllBtn.title = delLabel;
      delAllBtn.setAttribute("aria-label", delLabel);
    }

    if (q) {
      const tokens = q.split(" ").filter(Boolean);
      const matchedItems = [];
      for (const r of storeFiltered) {
        for (const it of (r.items || [])) {
          const itemHay = searchNorm(`${it.productNameSnapshot || ""} ${it.productBrandSnapshot || ""}`);
          if (tokens.every((tok) => itemHay.includes(tok))) {
            matchedItems.push({ receipt: r, item: it });
          }
        }
      }
      if (countBadge) countBadge.textContent = String(matchedItems.length);
      if (!matchedItems.length) {
        container.innerHTML = `<div class="empty">Nessun articolo trovato nell'archivio spese.</div>`;
        return;
      }
      container.innerHTML = matchedItems.map(({ receipt: r, item: it }) => {
        const dt = fmtIsoDate(r.purchaseDate, r.archivedAt);
        const topMetaHtml = `<div class="archive-search-item-head">
          <span class="archive-search-item-store">${receiptStoreChip(r)}</span>
          <span class="archive-search-item-date">${dt}</span>
        </div>`;
        return renderReceiptItemRowHtml(it, {
          extraClass: "archive-search-item-row",
          topMetaHtml,
          openReceiptId: r.id
        });
      }).join("");

      container.querySelectorAll("[data-open-receipt]").forEach((row) => {
        row.addEventListener("click", () => {
          state.currentModal = null;
          state.currentModalKeep = false;
          openReceiptDetailWindow(row.dataset.openReceipt, { storeFilter: selectedStoreKey, searchQuery });
        });
      });
      return;
    }

    if (countBadge) countBadge.textContent = String(storeFiltered.length);

    if (!storeFiltered.length) {
      container.innerHTML = `<div class="empty">${receipts.length ? "Nessuno scontrino corrisponde ai filtri." : "Nessuna spesa archiviata.<br>Tocca \u201CArchivia spesa corrente\u201D per salvare il tuo primo scontrino."}</div>`;
      return;
    }

    container.innerHTML = storeFiltered.map((r) => {
      const t = computeReceiptTotals(r);
      const dt = fmtIsoDate(r.purchaseDate, r.archivedAt);
      const noteText = r.note || "";
      return swipeWrap(`<div class="list-row compact saved-row archive-row" data-receipt-row="${r.id}">
        <div class="archive-row-grid">
          <div class="archive-row-left">
            <span class="archive-row-store">${receiptStoreChip(r)}</span>
            ${noteText ? `<div class="archive-row-note">${esc(noteText)}</div>` : ""}
            <div class="archive-row-meta">${t.itemsCount} ${t.itemsCount === 1 ? "articolo" : "articoli"}</div>
          </div>
          <div class="archive-row-right">
            <span class="archive-row-date">${dt}</span>
            <strong class="archive-row-total">${money(t.finalTotalMinor)}</strong>
          </div>
        </div>
      </div>`, "swipe-compact");
    }).join("");

    container.querySelectorAll("[data-receipt-row]").forEach((row) => {
      row.addEventListener("click", () => {
        if (row.dataset.swiping === "1") return;
        state.currentModal = null;
        state.currentModalKeep = false;
        openReceiptDetailWindow(row.dataset.receiptRow, { storeFilter: selectedStoreKey, searchQuery });
      });
    });

    bindSwipeDelete(container, "[data-receipt-row]", async (row) => {
      const rec = receipts.find((x) => x.id === row.dataset.receiptRow);
      if (!rec) return false;
      const dt = fmtIsoDate(rec.purchaseDate, rec.archivedAt);
      const yes = await confirmDialog(
        "Elimina scontrino",
        `Lo scontrino di <strong>${esc(rec.storeNameSnapshot || "Senza supermercato")}</strong> del ${dt} verr\xE0 eliminato definitivamente. Procedere comunque?`,
        "Elimina",
        { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openArchiveWindow({ storeFilter: selectedStoreKey, searchQuery }) }
      );
      if (!yes) return false;
      await delOne("archivedReceipts", rec.id);
      await openArchiveWindow({ storeFilter: selectedStoreKey, searchQuery });
      showToast("Scontrino eliminato");
    });
  };

  paintReceipts();

  $("#archiveCurrentBtn")?.addEventListener("click", () => {
    state.currentModal = null;
    state.currentModalKeep = false;
    openArchiveCurrentListModal();
  });

  if (receipts.length) {
    wireSingleFilter("archiveStoreFilter", {
      onSelect: (val) => {
        selectedStoreKey = val || "all";
        updateSingleFilterUI("archiveStoreFilter", { allLabel: allStoresLabel, options: storeFilterOptions, selectedValue: selectedStoreKey });
        paintReceipts();
      }
    });
  }

  if (searchInp) {
    attachSearchClear(searchInp, () => {
      searchQuery = "";
      paintReceipts();
    });
    searchInp.addEventListener("input", () => {
      searchQuery = searchInp.value;
      paintReceipts();
    });
  }

  $("#delAllArchivedBtn")?.addEventListener("click", async () => {
    const targets = getStoreFilteredReceipts();
    if (!targets.length) return;
    const isAll = selectedStoreKey === "all";
    const msg = isAll
      ? (targets.length === 1
        ? "L'unico scontrino archiviato verr\xE0 eliminato definitivamente. Procedere comunque?"
        : `Tutti i ${targets.length} scontrini archiviati verranno eliminati definitivamente. Procedere comunque?`)
      : (targets.length === 1
        ? `Lo scontrino archiviato di <strong>${esc(selectedStoreKey)}</strong> verr\xE0 eliminato definitivamente. Procedere comunque?`
        : `Tutti i ${targets.length} scontrini archiviati di <strong>${esc(selectedStoreKey)}</strong> verranno eliminati definitivamente. Procedere comunque?`);
    const yes = await confirmDialog(
      "Elimina archivio spese",
      msg,
      targets.length === 1 ? "Elimina" : "Elimina tutti",
      { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openArchiveWindow({ storeFilter: selectedStoreKey, searchQuery }) }
    );
    if (!yes) return;
    const tx = state.db.transaction("archivedReceipts", "readwrite");
    const os = tx.objectStore("archivedReceipts");
    if (isAll) {
      os.clear();
    } else {
      for (const r of targets) os.delete(r.id);
    }
    await txDone(tx);
    await openArchiveWindow({ storeFilter: "all", searchQuery: isAll ? "" : searchQuery });
    showToast(isAll
      ? "Archivio spese svuotato"
      : (targets.length === 1 ? `Scontrino di ${selectedStoreKey} eliminato` : `Spese di ${selectedStoreKey} eliminate`));
  });
}

export async function openArchiveCurrentListModal() {
  const [itemsRaw, products, cats, storesList, prices, routes, curSavedId] = await Promise.all([
    activeItems(),
    getAll("products"),
    getAll("categories"),
    getAll("stores"),
    getAll("productPrices"),
    getAll("storeCategoryRoutes"),
    currentSavedListId()
  ]);

  const curSavedList = curSavedId ? await getOne("savedLists", curSavedId) : null;
  const pMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const cMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const sMap = Object.fromEntries(storesList.map((s) => [s.id, s]));
  const priceLookup = new Map(prices.map((pr) => [`${pr.productId}|${pr.storeId}`, pr]));

  const items = itemsRaw.filter((i) => !!pMap[i.productId]);
  if (!items.length) {
    showToast("La lista \xE8 vuota.");
    await openArchiveWindow();
    return;
  }

  // Group items by storeId ("__none__" if null/unknown)
  const groupsMap = new Map();
  for (const it of items) {
    const sto = it.storeId && sMap[it.storeId] ? sMap[it.storeId] : null;
    const key = sto ? sto.id : "__none__";
    let g = groupsMap.get(key);
    if (!g) {
      g = { key, storeId: sto ? sto.id : null, storeObj: sto, storeName: sto ? sto.name : "Senza supermercato", items: [] };
      groupsMap.set(key, g);
    }
    g.items.push(it);
  }
  const groups = [...groupsMap.values()].sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.storeName.localeCompare(b.storeName, "it", { sensitivity: "base" });
  });

  const selectedStoreKeys = new Set(groups.map((g) => g.key));
  let scopeMode = "all";
  let saveQuickPricesToCatalog = false;
  const quickPricesMap = new Map(); // itemId -> amountMinor (number)

  const getCandidateGroups = () => groups.filter((g) => selectedStoreKeys.has(g.key));
  const getItemsForGroup = (g) => scopeMode === "checked" ? g.items.filter((i) => i.checked) : g.items;

  const isMultiStore = groups.length > 1;
  const storeRowsHtml = groups.map((g) => {
    const chkCount = g.items.filter((i) => i.checked).length;
    const chip = g.storeObj ? storeChipHtml(g.storeObj, { className: "archive-store-chip", defaultBold: true }) : '<span class="it">Senza supermercato</span>';
    return `<label class="archive-store-opt">
      <input type="checkbox" data-arch-store="${esc(g.key)}" ${selectedStoreKeys.has(g.key) ? "checked" : ""}>
      <span class="archive-store-opt-body">
        <span class="archive-store-opt-name">${chip}</span>
        <span class="archive-store-opt-meta">${chkCount}/${g.items.length} spuntati</span>
      </span>
    </label>`;
  }).join("");

  const body = `<div class="saved-lists-sheet archive-wizard-sheet">
    ${isMultiStore ? `
      <div class="archive-card">
        <div class="archive-card-title">Supermercati da archiviare</div>
        <div class="archive-card-hint">Verr\xE0 creato uno scontrino distinto per ciascun punto vendita selezionato.</div>
        <div class="archive-store-list">${storeRowsHtml}</div>
      </div>` : `
      <div class="archive-card archive-single-store-bar">
        <span class="archive-single-lbl">Supermercato</span>
        <span>${groups[0].storeObj ? storeChipHtml(groups[0].storeObj, { className: "archive-store-chip", defaultBold: true }) : '<span class="it">Senza supermercato</span>'}</span>
      </div>`}

    <div class="archive-card archive-meta-card">
      <div class="field">
        <div class="archive-note-label-row">
          <label for="archiveNoteInput">Nome e Data spesa</label>
          <span class="archive-picked-date" id="archivePickedDate" hidden></span>
        </div>
        <div class="archive-note-input-row">
          <div class="name-box">
            <input id="archiveNoteInput" type="text" maxlength="20" autocomplete="off">
            <button type="button" class="name-no" id="archiveNoteNo" aria-label="Annulla" title="Annulla">${SVG_X}</button>
            <button type="button" class="name-ok" id="archiveNoteOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button>
          </div>
          <div class="archive-cal-btn" id="archiveCalBtn" title="Scegli data spesa">
            ${CALENDAR_ICON_SVG}
            <input id="archivePurchaseDate" type="date" class="archive-cal-native-input" aria-label="Scegli data spesa">
          </div>
        </div>
      </div>
    </div>

    <div class="archive-card" id="archiveScopeCard">
      <div class="archive-card-title">Articoli da includere</div>
      <div class="archive-scope-options">
        <label class="radio-opt archive-radio-opt" id="scopeAllOpt">
          <input type="radio" name="archiveScope" value="all" checked>
          <span class="archive-radio-label">Includi tutti gli articoli</span>
        </label>
        <label class="radio-opt archive-radio-opt" id="scopeCheckedOpt">
          <input type="radio" name="archiveScope" value="checked">
          <span class="archive-radio-label">Solo articoli spuntati</span>
        </label>
      </div>
    </div>

    <div id="archiveMissingBox" class="archive-card archive-warn-card" hidden></div>

    <div id="archiveLiveSummary" class="archive-live-summary"></div>
  </div>`;

  const doArchive = async () => {
    const chosenGroups = getCandidateGroups()
      .map((g) => ({ group: g, items: getItemsForGroup(g) }))
      .filter((x) => x.items.length > 0);

    if (!chosenGroups.length) {
      showToast("Nessun articolo selezionato da archiviare.");
      return;
    }

    const noteEl = $("#archiveNoteInput");
    const dateEl = $("#archivePurchaseDate");
    const pickedEl = $("#archivePickedDate");
    const calBtnEl = $("#archiveCalBtn");
    const rawNote = (noteEl?.value || "").trim().slice(0, 20);
    const rawDate = (dateEl?.value || "").trim();
    const missingNote = !rawNote;
    const missingDate = !rawDate;

    if (missingNote || missingDate) {
      if (missingNote && noteEl) {
        noteEl.value = "";
        noteEl.placeholder = "Nome mancante";
        noteEl.classList.add("invalid", "is-missing");
      }
      if (missingDate) {
        if (pickedEl) {
          pickedEl.textContent = "Data mancante";
          pickedEl.classList.add("is-missing");
          pickedEl.hidden = false;
        }
        calBtnEl?.classList.add("invalid");
      }
      $("#modalRoot .archive-meta-card")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      return;
    }

    // Check remaining missing prices
    const unresolvedItems = [];
    for (const entry of chosenGroups) {
      for (const it of entry.items) {
        const qp = quickPricesMap.has(it.id) ? quickPricesMap.get(it.id) : null;
        const pricing = resolveActiveItemPricing(it, priceLookup, qp);
        if (pricing.priceMissing) unresolvedItems.push(it);
      }
    }

    if (unresolvedItems.length > 0) {
      const n = unresolvedItems.length;
      const yes = await confirmDialog(
        "Prezzi N/D presenti",
        `${n === 1 ? "C\u2019\xE8 ancora 1 articolo" : `Ci sono ancora ${n} articoli`} senza prezzo (N/D).<br><br>Archiviando ora, ${n === 1 ? "verr\xE0 registrato" : "verranno registrati"} a <strong>0,00 \u20AC</strong>. Vuoi procedere comunque?`,
        "Archivia comunque",
        { overlay: true, cancelFirst: true, confirmClass: "btn-primary", themed: true, backdropClose: false }
      );
      if (!yes) return;
    }

    const purchaseDate = rawDate;
    const note = rawNote;

    // Optionally persist quick prices to catalog (productPrices & productStores)
    if (saveQuickPricesToCatalog && quickPricesMap.size > 0) {
      const existingStores = await getAll("productStores");
      const toPutPrices = [];
      const toPutStores = [];
      const seenProductStore = new Set(existingStores.map((x) => `${x.productId}|${x.storeId}`));
      for (const entry of chosenGroups) {
        for (const it of entry.items) {
          if (!it.storeId || !quickPricesMap.has(it.id)) continue;
          const amountMinor = quickPricesMap.get(it.id);
          if (amountMinor === null || Number.isNaN(amountMinor)) continue;
          const k = `${it.productId}|${it.storeId}`;
          const curPr = priceLookup.get(k);
          const rec = { id: curPr ? curPr.id : uuid(), productId: it.productId, storeId: it.storeId, amountMinor, currency: "EUR", updatedAt: now() };
          toPutPrices.push(rec);
          priceLookup.set(k, rec);
          if (!seenProductStore.has(k)) {
            seenProductStore.add(k);
            toPutStores.push({ id: uuid(), productId: it.productId, storeId: it.storeId, createdAt: now() });
          }
        }
      }
      if (toPutPrices.length || toPutStores.length) {
        const ptx = state.db.transaction(["productPrices", "productStores"], "readwrite");
        const pp = ptx.objectStore("productPrices");
        const ps = ptx.objectStore("productStores");
        for (const rec of toPutPrices) pp.put(rec);
        for (const rec of toPutStores) ps.put(rec);
        await txDone(ptx);
      }
    }

    const createdReceipts = chosenGroups.map(({ group, items: gItems }) =>
      buildReceiptSnapshot({
        storeObj: group.storeObj,
        storeId: group.storeId,
        itemsToArchive: gItems,
        purchaseDate,
        note,
        sourceListName: curSavedList?.name || null,
        quickPricesMap,
        pMap,
        cMap,
        priceLookup,
        routes
      })
    );

    const tx = state.db.transaction(["archivedReceipts"], "readwrite");
    const arOs = tx.objectStore("archivedReceipts");
    for (const rec of createdReceipts) arOs.put(rec);
    await txDone(tx);

    state.currentModal = null;
    state.currentModalKeep = false;
    if (createdReceipts.length === 1) {
      await openReceiptDetailWindow(createdReceipts[0].id);
      showToast("Spesa archiviata");
    } else {
      await openArchiveWindow();
      showToast(`Archiviati ${createdReceipts.length} scontrini`);
    }
  };

  modal("Archivia spesa", body, [
    { label: "Annulla", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openArchiveWindow(); } },
    { label: "Archivia", class: "btn-primary", action: doArchive }
  ], {
    closeButton: true,
    backdropClose: false,
    alignTop: true,
    keepModalOnClose: true,
    themed: true,
    onClose: () => openArchiveWindow()
  });

  const root = $("#modalRoot");
  const archiveBtn = [...root.querySelectorAll("[data-modal-action]")].find((b) => b.textContent.trim() === "Archivia");
  const missingBox = $("#archiveMissingBox");
  const liveSummary = $("#archiveLiveSummary");
  const checkedRadio = root.querySelector('input[name="archiveScope"][value="checked"]');
  const allRadio = root.querySelector('input[name="archiveScope"][value="all"]');

  const updateSummaryOnly = () => {
    const chosenGroups = getCandidateGroups()
      .map((g) => ({ group: g, items: getItemsForGroup(g) }))
      .filter((x) => x.items.length > 0);

    let totalItems = 0;
    let totalMinor = 0;
    let remainingNd = 0;
    for (const entry of chosenGroups) {
      for (const it of entry.items) {
        totalItems++;
        const qp = quickPricesMap.has(it.id) ? quickPricesMap.get(it.id) : null;
        const pricing = resolveActiveItemPricing(it, priceLookup, qp);
        totalMinor += pricing.lineTotalMinor;
        if (pricing.priceMissing) remainingNd++;
      }
    }

    if (archiveBtn) archiveBtn.disabled = totalItems === 0;

    if (!totalItems) {
      liveSummary.innerHTML = `<div class="archive-live-empty">Seleziona almeno un supermercato con articoli da archiviare.</div>`;
      return;
    }

    const receiptsWord = chosenGroups.length === 1 ? "1 scontrino" : `${chosenGroups.length} scontrini distinti`;
    liveSummary.innerHTML = `
      <div class="archive-live-row">
        <span>Verranno creati <strong>${receiptsWord}</strong> (${totalItems} ${totalItems === 1 ? "articolo" : "articoli"})</span>
        <strong class="archive-live-total">${money(totalMinor)}</strong>
      </div>
      ${remainingNd > 0 ? `<div class="archive-live-warn">${remainingNd} ${remainingNd === 1 ? "articolo" : "articoli"} ancora senza prezzo (N/D)</div>` : ""}
    `;
  };

  const refreshWizard = () => {
    const candGroups = getCandidateGroups();
    let candCheckedCount = 0;
    for (const g of candGroups) {
      candCheckedCount += g.items.filter((i) => i.checked).length;
    }

    if (checkedRadio) {
      checkedRadio.disabled = candCheckedCount === 0;
      if (candCheckedCount === 0 && scopeMode === "checked") {
        scopeMode = "all";
        if (allRadio) allRadio.checked = true;
      }
    }

    // Collect items that naturally lack a price (N/D in list)
    const missingItems = [];
    for (const g of candGroups) {
      for (const it of getItemsForGroup(g)) {
        const basePricing = resolveActiveItemPricing(it, priceLookup, null);
        if (basePricing.priceMissing) missingItems.push({ item: it, group: g });
      }
    }

    if (missingItems.length > 0) {
      const hasAnyWithStore = missingItems.some((x) => !!x.item.storeId);
      missingBox.hidden = false;
      missingBox.innerHTML = `
        <div class="archive-warn-head">
          <strong>Attenzione: ${missingItems.length} ${missingItems.length === 1 ? "articolo senza prezzo" : "articoli senza prezzo"} (N/D)</strong>
          <div class="archive-warn-sub">Inserisci qui il prezzo unitario per evitare totali falsati a zero (facoltativo).</div>
        </div>
        <div class="archive-nd-list">
          ${missingItems.map(({ item, group }) => {
            const p = pMap[item.productId];
            const dp = productDisplayParts(p);
            const curVal = quickPricesMap.has(item.id)
              ? (quickPricesMap.get(item.id) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
              : "";
            return `<div class="archive-nd-row">
              <div class="archive-nd-info">
                <div class="archive-nd-name">${dp.titleHtml}</div>
                <div class="archive-nd-meta">${esc(group.storeName)} \u00B7 ${fmtQtyUnit(item.quantity, p.unit)} ${esc(displayUnit(p))}</div>
              </div>
              <div class="archive-nd-input-wrap">
                <input type="text" inputmode="decimal" class="archive-nd-input" data-nd-item="${item.id}" placeholder="0,00" value="${esc(curVal)}" aria-label="Prezzo unitario per ${esc(dp.title)}">
                <span class="archive-nd-unit">\u20AC/${esc(displayUnit(p))}</span>
              </div>
            </div>`;
          }).join("")}
        </div>
        ${hasAnyWithStore ? `<label class="check-line archive-save-prices-opt"><input type="checkbox" id="archiveSaveCatalogPrices"${saveQuickPricesToCatalog ? " checked" : ""}> <span>Aggiorna anche il prezzo di listino del supermercato</span></label>` : ""}
      `;

      missingBox.querySelectorAll("[data-nd-item]").forEach((inp) => {
        selectAllOnFocus(inp);
        inp.addEventListener("input", () => {
          const id = inp.dataset.ndItem;
          const v = inp.value.trim();
          if (!v) {
            quickPricesMap.delete(id);
          } else {
            const cents = eurosFromInput(v);
            if (cents !== null && !Number.isNaN(cents)) quickPricesMap.set(id, cents);
            else quickPricesMap.delete(id);
          }
          updateSummaryOnly();
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault();
            inp.blur();
            releaseModalKeyboard();
          }
        });
      });

      $("#archiveSaveCatalogPrices")?.addEventListener("change", (e) => {
        saveQuickPricesToCatalog = !!e.target.checked;
      });
    } else {
      missingBox.hidden = true;
      missingBox.innerHTML = "";
    }

    updateSummaryOnly();
  };

  root.querySelectorAll("[data-arch-store]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedStoreKeys.add(cb.dataset.archStore);
      else selectedStoreKeys.delete(cb.dataset.archStore);
      refreshWizard();
    });
  });

  root.querySelectorAll('input[name="archiveScope"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        scopeMode = r.value;
        refreshWizard();
      }
    });
  });

  const noteInp = $("#archiveNoteInput");
  const noteBox = noteInp?.closest(".name-box");
  let confirmedNoteVal = "";
  const clearNoteMissing = () => {
    if (!noteInp) return;
    noteInp.classList.remove("invalid", "is-missing");
    noteInp.placeholder = "";
  };
  const syncNoteDirty = () => {
    if (!noteInp || !noteBox) return;
    noteBox.classList.toggle("dirty", noteInp.value !== confirmedNoteVal);
  };
  if (noteInp && noteBox) {
    noteInp.addEventListener("input", () => {
      if (noteInp.value.length > 20) noteInp.value = noteInp.value.slice(0, 20);
      if (noteInp.value.trim()) clearNoteMissing();
      syncNoteDirty();
    });
    $("#archiveNoteNo")?.addEventListener("mousedown", (e) => e.preventDefault());
    $("#archiveNoteNo")?.addEventListener("click", () => {
      noteInp.value = confirmedNoteVal;
      if (noteInp.value.trim()) clearNoteMissing();
      syncNoteDirty();
      noteInp.blur();
      releaseModalKeyboard();
    });
    $("#archiveNoteOk")?.addEventListener("mousedown", (e) => e.preventDefault());
    const confirmArchiveNote = () => {
      confirmedNoteVal = noteInp.value.trim().slice(0, 20);
      noteInp.value = confirmedNoteVal;
      if (confirmedNoteVal) clearNoteMissing();
      syncNoteDirty();
      noteInp.blur();
      releaseModalKeyboard();
    };
    $("#archiveNoteOk")?.addEventListener("click", confirmArchiveNote);
    noteInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        confirmArchiveNote();
      } else if (e.key === "Escape") {
        e.preventDefault();
        noteInp.value = confirmedNoteVal;
        if (noteInp.value.trim()) clearNoteMissing();
        syncNoteDirty();
        noteInp.blur();
        releaseModalKeyboard();
      }
    });
  }

  const dateInp = $("#archivePurchaseDate");
  const pickedDateEl = $("#archivePickedDate");
  const calBtn = $("#archiveCalBtn");
  const syncPickedDate = () => {
    if (!pickedDateEl || !dateInp) return;
    const v = (dateInp.value || "").trim();
    if (v) {
      pickedDateEl.textContent = fmtIsoDate(v);
      pickedDateEl.classList.remove("is-missing");
      pickedDateEl.hidden = false;
      calBtn?.classList.remove("invalid");
    } else {
      pickedDateEl.textContent = "";
      pickedDateEl.classList.remove("is-missing");
      pickedDateEl.hidden = true;
      calBtn?.classList.remove("invalid");
    }
  };
  dateInp?.addEventListener("click", () => {
    try { dateInp.showPicker?.(); } catch (_) {}
  });
  dateInp?.addEventListener("change", syncPickedDate);
  dateInp?.addEventListener("input", syncPickedDate);

  refreshWizard();
}

export async function openReceiptDetailWindow(receiptId, archiveOpts = {}, detailState = {}) {
  const receipt = await getOne("archivedReceipts", receiptId);
  if (!receipt) {
    showToast("Scontrino non trovato.");
    await openArchiveWindow(archiveOpts);
    return;
  }

  let currentReceipt = receipt;
  const t = computeReceiptTotals(currentReceipt);
  const dt = fmtIsoDate(currentReceipt.purchaseDate, currentReceipt.archivedAt);
  const adjustments = Array.isArray(currentReceipt.adjustments) ? currentReceipt.adjustments : [];
  let items = Array.isArray(currentReceipt.items) ? currentReceipt.items : [];
  if (!currentReceipt.itemsOrderedByList && items.length > 1) {
    const routes = currentReceipt.storeId ? await getAll("storeCategoryRoutes") : [];
    const routePosition = (sid, catId) => {
      if (!sid || !catId) return 99999;
      return routes.find((r) => r.storeId === sid && r.categoryId === catId)?.position ?? 99999;
    };
    items = [...items].sort((a, b) => {
      if (currentReceipt.storeId) {
        const d = routePosition(currentReceipt.storeId, a.categoryId) - routePosition(currentReceipt.storeId, b.categoryId);
        if (d) return d;
      }
      const ca = a.categoryId ? (a.categoryNameSnapshot || "") : "";
      const cb = b.categoryId ? (b.categoryNameSnapshot || "") : "";
      return ca.localeCompare(cb, "it", { sensitivity: "base" }) ||
        (a.productNameSnapshot || "").localeCompare(b.productNameSnapshot || "", "it", { sensitivity: "base" });
    });
  }
  let adjType = detailState.adjType === "deduct" ? "deduct" : "add";
  let selectedPreset = "";

  const itemsRowsHtml = items.map((it) => renderReceiptItemRowHtml(it)).join("");

  const renderAdjCardRowsHtml = (type) => adjustments
    .filter((adj) => adj.type === type)
    .map((adj) => {
      const isAdd = adj.type === "add";
      const sign = isAdd ? "+" : "\u2212";
      const amt = Math.max(0, Number(adj.amountMinor) || 0);
      return swipeWrap(`<div class="receipt-adj-item-compact ${isAdd ? "is-add" : "is-deduct"}" data-adj-card-row="${esc(adj.id)}">
        <span class="receipt-adj-compact-name">${esc(adj.label)}</span>
        <strong class="receipt-adj-compact-amount ${isAdd ? "is-add" : "is-deduct"}">${sign}${money(amt)}</strong>
      </div>`, "swipe-receipt-adj");
    }).join("");

  const adjCardRowsHtml = renderAdjCardRowsHtml(adjType);

  const nonRoundingMap = new Map();
  let hasRounding = false;
  let roundingNetMinor = 0;
  for (const adj of adjustments) {
    const amt = Math.max(0, Number(adj.amountMinor) || 0);
    const nLabel = norm(adj.label);
    if (nLabel === "arrotondamento") {
      hasRounding = true;
      roundingNetMinor += adj.type === "add" ? amt : -amt;
    } else {
      const key = `${adj.type}|${nLabel}`;
      const existing = nonRoundingMap.get(key);
      if (existing) {
        existing.amountMinor += amt;
      } else {
        nonRoundingMap.set(key, { kind: adj.type, label: adj.label, amountMinor: amt });
      }
    }
  }
  const receiptAdjDisplayRows = [...nonRoundingMap.values()];
  if (hasRounding) {
    receiptAdjDisplayRows.push({
      kind: roundingNetMinor > 0 ? "add" : (roundingNetMinor < 0 ? "deduct" : "neutral"),
      label: "Arrotondamento",
      amountMinor: Math.abs(roundingNetMinor),
      isRounding: true
    });
  }

  const adjReceiptRowsHtml = receiptAdjDisplayRows.map((row) => {
    const cls = row.kind === "add" ? "is-add" : (row.kind === "deduct" ? "is-deduct" : "is-neutral");
    const sign = row.kind === "add" ? "+" : (row.kind === "deduct" ? "\u2212" : "");
    const catText = row.kind === "add" ? "Aggiunta" : (row.kind === "deduct" ? "Detrazione" : "Compensato");
    return `<div class="receipt-item-row receipt-adj-item-row receipt-adj-readonly ${cls}">
      <div class="receipt-item-top">
        <span class="receipt-item-name">${esc(row.label)}</span>
      </div>
      <div class="receipt-item-bottom">
        <span class="receipt-item-cat">${catText}</span>
        <strong class="receipt-item-total ${cls}">${sign}${money(row.amountMinor)}</strong>
      </div>
    </div>`;
  }).join("");

  const renderPresetChip = (lbl) =>
    `<button type="button" class="receipt-preset-chip${selectedPreset === lbl ? " is-selected" : ""}" data-adj-preset="${esc(lbl)}">${esc(lbl)}</button>`;
  const renderPresetsHtml = (type) => {
    if (type === "deduct") {
      const row1 = ADJUSTMENT_PRESETS.deduct.slice(0, 3).map(renderPresetChip).join("");
      const row2 = ADJUSTMENT_PRESETS.deduct.slice(3).map(renderPresetChip).join("");
      return `<div class="receipt-presets-deduct-wrap"><div class="receipt-presets-row is-deduct-row1">${row1}</div><div class="receipt-presets-row is-deduct-row2">${row2}</div><div class="receipt-presets-row receipt-presets-spacer" aria-hidden="true"></div></div>`;
    }
    return ADJUSTMENT_PRESETS[type].map(renderPresetChip).join("");
  };

  const body = `<div class="saved-lists-sheet receipt-detail-sheet">
    <div class="receipt-hero-sticky">
      <div class="receipt-hero-card">
        <div class="receipt-hero-head">
          <div class="receipt-hero-store">${receiptStoreChip(currentReceipt, "store-chip-heading")}</div>
          <span class="receipt-hero-date">${dt}</span>
        </div>
        <div class="name-box receipt-hero-note-box">
          <input id="receiptNoteInput" type="text" maxlength="20" value="${esc(currentReceipt.note || "")}" placeholder="Nome spesa" autocomplete="off" aria-label="Nome spesa">
          <button type="button" class="name-no" id="receiptNoteNo" aria-label="Annulla" title="Annulla">${SVG_X}</button>
          <button type="button" class="name-ok" id="receiptNoteOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button>
        </div>
      </div>
    </div>

    <div class="archive-card receipt-adj-card">
      <div class="saved-list-head">
        <div class="saved-list-head-left">
          <span class="saved-list-title">Aggiunte e detrazioni allo scontrino</span>
        </div>
      </div>
      <div class="receipt-tabs-wrap ${adjType === "deduct" ? "is-deduct" : "is-add"}" id="receiptTabsWrap">
        <div class="receipt-tabs-bar" role="tablist" aria-label="Tipo voce scontrino">
          <button type="button" role="tab" aria-selected="${adjType === "add" ? "true" : "false"}" class="receipt-tab-btn is-add${adjType === "add" ? " active" : ""}" data-adj-type="add">+ Aggiunte</button>
          <button type="button" role="tab" aria-selected="${adjType === "deduct" ? "true" : "false"}" class="receipt-tab-btn is-deduct${adjType === "deduct" ? " active" : ""}" data-adj-type="deduct">\u2212 Detrazioni</button>
        </div>
        <div class="receipt-tab-panel" role="tabpanel">
          <div class="receipt-presets" id="receiptAdjPresets">${renderPresetsHtml(adjType)}</div>
          <div class="receipt-adj-inputs">
            <div class="receipt-adj-amt-field">
              <span class="receipt-adj-sign ${adjType === "deduct" ? "is-deduct" : "is-add"}" id="adjSignIndicator" aria-hidden="true">${adjType === "deduct" ? "\u2212" : "+"}</span>
              <div class="name-box receipt-adj-amt-box">
                <input type="text" inputmode="decimal" enterkeyhint="done" id="adjAmountInput" maxlength="7" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" aria-label="Importo in euro">
                <button type="button" class="name-no" id="adjAmountNo" aria-label="Annulla" title="Annulla">${SVG_X}</button>
                <button type="button" class="name-ok" id="adjAmountOk" aria-label="Conferma importo" title="Conferma importo">${SVG_CHK}</button>
              </div>
              <span class="receipt-adj-eur">\u20AC</span>
            </div>
            <button type="button" class="btn btn-primary btn-small" id="addAdjBtn">Aggiungi</button>
          </div>
          <div class="receipt-adj-records" id="receiptAdjRecords"${adjCardRowsHtml ? "" : " hidden"}>${adjCardRowsHtml}</div>
        </div>
      </div>
    </div>

    <div class="saved-list-section receipt-items-section">
      <div class="saved-list-head receipt-scontrino-banner">
        <div class="saved-list-head-left">
          <span class="receipt-scontrino-icon" aria-hidden="true">${SCONTRINO_ICON_SVG}</span>
          <span class="saved-list-title">Scontrino</span>
          <span class="title-count-badge">${items.length + receiptAdjDisplayRows.length}</span>
        </div>
        <strong class="receipt-scontrino-total">${money(t.finalTotalMinor)}</strong>
      </div>
      <div class="receipt-items-list" id="receiptItemsList">${itemsRowsHtml}${adjReceiptRowsHtml}</div>
    </div>
  </div>`;

  modal("Dettaglio scontrino", body, [
    { label: "Chiudi", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openArchiveWindow(archiveOpts); } }
  ], {
    closeButton: true,
    backdropClose: false,
    alignTop: true,
    keepModalOnClose: true,
    themed: true,
    onClose: () => openArchiveWindow(archiveOpts)
  });

  const modalEl = $("#modalRoot .modal");
  if (typeof detailState.scrollTop === "number" && modalEl) {
    modalEl.scrollTop = detailState.scrollTop;
  }

  {
    const hh = $("#modalRoot .modal-header");
    hh.querySelector("h2").insertAdjacentHTML("beforeend", infoBtn);
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Gli articoli dello scontrino sono congelati alla data di archiviazione e non risentono di future modifiche al catalogo.<br>Puoi aggiungere AGGIUNTE (es. sacchetti) o DETRAZIONI (es. buoni fedelt\xE0) allo scontrino, o eliminarle scorrendo verso destra.</div>`);
  }

  const root = $("#modalRoot");
  const detailSheetEl = root.querySelector(".receipt-detail-sheet");
  const heroStickyEl = root.querySelector(".receipt-hero-sticky");
  const syncStickyHeroHeight = () => {
    if (!detailSheetEl || !heroStickyEl) return;
    const h = Math.ceil(heroStickyEl.getBoundingClientRect().height);
    if (h > 0) detailSheetEl.style.setProperty("--receipt-hero-h", `${h}px`);
  };
  syncStickyHeroHeight();
  requestAnimationFrame(syncStickyHeroHeight);
  if (heroStickyEl && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(syncStickyHeroHeight);
    ro.observe(heroStickyEl);
  }
  const noteInp = $("#receiptNoteInput");
  const noteBox = noteInp?.closest(".name-box");
  let savedNoteVal = currentReceipt.note || "";
  const syncReceiptNoteDirty = () => {
    if (!noteInp || !noteBox) return;
    noteBox.classList.toggle("dirty", noteInp.value !== savedNoteVal);
  };
  if (noteInp && noteBox) {
    noteInp.addEventListener("input", () => {
      if (noteInp.value.length > 20) noteInp.value = noteInp.value.slice(0, 20);
      syncReceiptNoteDirty();
    });
    $("#receiptNoteNo")?.addEventListener("mousedown", (e) => e.preventDefault());
    $("#receiptNoteNo")?.addEventListener("click", () => {
      noteInp.value = savedNoteVal;
      syncReceiptNoteDirty();
      noteInp.blur();
      releaseModalKeyboard();
    });
    $("#receiptNoteOk")?.addEventListener("mousedown", (e) => e.preventDefault());
    const saveReceiptNote = async () => {
      const nextNote = noteInp.value.trim().slice(0, 20);
      noteInp.value = nextNote;
      if (nextNote !== savedNoteVal) {
        currentReceipt = { ...currentReceipt, note: nextNote, updatedAt: now() };
        await putOne("archivedReceipts", currentReceipt);
        savedNoteVal = nextNote;
        showToast("Nome spesa aggiornato");
      }
      syncReceiptNoteDirty();
      noteInp.blur();
      releaseModalKeyboard();
    };
    $("#receiptNoteOk")?.addEventListener("click", saveReceiptNote);
    noteInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        saveReceiptNote();
      } else if (e.key === "Escape") {
        e.preventDefault();
        noteInp.value = savedNoteVal;
        syncReceiptNoteDirty();
        noteInp.blur();
        releaseModalKeyboard();
      }
    });
  }

  const amtInp = $("#adjAmountInput");
  const amtBox = amtInp?.closest(".name-box");
  const presetsWrap = $("#receiptAdjPresets");
  const adjRecordsEl = $("#receiptAdjRecords");
  const adjSignEl = $("#adjSignIndicator");

  const bindAdjSwipeDelete = () => {
    if (!adjRecordsEl || adjRecordsEl.hidden) return;
    bindSwipeDelete(adjRecordsEl, "[data-adj-card-row]", async (row) => {
      const adjId = row.dataset.adjCardRow;
      const removedIdx = adjustments.findIndex((a) => a.id === adjId);
      if (removedIdx === -1) return false;
      const removedAdj = adjustments[removedIdx];
      const updated = {
        ...currentReceipt,
        adjustments: adjustments.filter((a) => a.id !== adjId),
        updatedAt: now()
      };
      await putOne("archivedReceipts", updated);
      const keepScroll = modalEl ? modalEl.scrollTop : 0;
      state.currentModal = null;
      state.currentModalKeep = false;
      await openReceiptDetailWindow(currentReceipt.id, archiveOpts, { adjType, scrollTop: keepScroll });
      showUndoToast("Voce rimossa", async () => {
        const latest = await getOne("archivedReceipts", currentReceipt.id);
        if (!latest) return;
        const curAdjs = Array.isArray(latest.adjustments) ? [...latest.adjustments] : [];
        if (!curAdjs.some((a) => a.id === removedAdj.id)) {
          const insertAt = Math.max(0, Math.min(removedIdx, curAdjs.length));
          curAdjs.splice(insertAt, 0, removedAdj);
          await putOne("archivedReceipts", { ...latest, adjustments: curAdjs, updatedAt: now() });
        }
        if ($("#receiptItemsList")) {
          const curModal = $("#modalRoot .modal");
          const curScroll = curModal ? curModal.scrollTop : keepScroll;
          state.currentModal = null;
          state.currentModalKeep = false;
          await openReceiptDetailWindow(currentReceipt.id, archiveOpts, { adjType, scrollTop: curScroll });
        } else if ($("#archivedReceiptsContainer")) {
          state.currentModal = null;
          state.currentModalKeep = false;
          await openArchiveWindow(archiveOpts);
        }
      });
    });
  };
  bindAdjSwipeDelete();

  const bindPresetChips = () => {
    presetsWrap?.querySelectorAll("[data-adj-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPreset = btn.dataset.adjPreset || "";
        presetsWrap.querySelectorAll("[data-adj-preset]").forEach((b) => {
          b.classList.toggle("is-selected", b.dataset.adjPreset === selectedPreset);
        });
        amtInp?.focus();
      });
    });
  };
  bindPresetChips();

  const tabsWrap = $("#receiptTabsWrap");
  root.querySelectorAll("[data-adj-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextType = btn.dataset.adjType === "deduct" ? "deduct" : "add";
      if (nextType === adjType) return;
      adjType = nextType;
      selectedPreset = "";
      tabsWrap?.classList.toggle("is-add", adjType === "add");
      tabsWrap?.classList.toggle("is-deduct", adjType === "deduct");
      if (adjSignEl) {
        adjSignEl.textContent = adjType === "deduct" ? "\u2212" : "+";
        adjSignEl.classList.toggle("is-add", adjType === "add");
        adjSignEl.classList.toggle("is-deduct", adjType === "deduct");
      }
      root.querySelectorAll("[data-adj-type]").forEach((b) => {
        const isAct = b.dataset.adjType === adjType;
        b.classList.toggle("active", isAct);
        b.setAttribute("aria-selected", String(isAct));
      });
      if (presetsWrap) {
        presetsWrap.innerHTML = renderPresetsHtml(adjType);
        bindPresetChips();
      }
      if (adjRecordsEl) {
        const rowsHtml = renderAdjCardRowsHtml(adjType);
        adjRecordsEl.innerHTML = rowsHtml;
        adjRecordsEl.hidden = !rowsHtml;
        bindAdjSwipeDelete();
      }
    });
  });

  let confirmedAmtVal = "";
  const syncAmtDirty = () => {
    if (!amtInp || !amtBox) return;
    amtBox.classList.toggle("dirty", amtInp.value !== confirmedAmtVal);
  };
  if (amtInp && amtBox) {
    selectAllOnFocus(amtInp);
    amtInp.addEventListener("input", () => {
      const clean = sanitizeReceiptAmountInput(amtInp.value);
      if (amtInp.value !== clean) amtInp.value = clean;
      syncAmtDirty();
    });
    $("#adjAmountNo")?.addEventListener("mousedown", (e) => e.preventDefault());
    $("#adjAmountNo")?.addEventListener("click", () => {
      amtInp.value = confirmedAmtVal;
      syncAmtDirty();
      amtInp.blur();
      releaseModalKeyboard();
    });
    $("#adjAmountOk")?.addEventListener("mousedown", (e) => e.preventDefault());
    const confirmAmtInput = () => {
      const raw = amtInp.value.trim();
      if (!raw) {
        confirmedAmtVal = "";
        amtInp.value = "";
        syncAmtDirty();
        amtInp.blur();
        releaseModalKeyboard();
        return;
      }
      const cents = eurosFromInput(raw);
      if (cents === null || Number.isNaN(cents) || cents <= 0 || cents > 999999) {
        showToast("Inserisci un importo valido maggiore di zero (max 9999,99 \u20AC).");
        amtInp.focus();
        return;
      }
      confirmedAmtVal = (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
      amtInp.value = confirmedAmtVal;
      syncAmtDirty();
      amtInp.blur();
      releaseModalKeyboard();
    };
    $("#adjAmountOk")?.addEventListener("click", confirmAmtInput);
    amtInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        confirmAmtInput();
      } else if (e.key === "Escape") {
        e.preventDefault();
        amtInp.value = confirmedAmtVal;
        syncAmtDirty();
        amtInp.blur();
        releaseModalKeyboard();
      }
    });
  }

  const commitAdjustment = async () => {
    const label = selectedPreset.trim();
    const amtRaw = (amtInp?.value || "").trim();
    if (!label) {
      showToast("Seleziona prima un'opzione disponibile.");
      return;
    }
    const amountMinor = eurosFromInput(amtRaw);
    if (amountMinor === null || Number.isNaN(amountMinor) || amountMinor <= 0 || amountMinor > 999999) {
      showToast("Inserisci un importo valido maggiore di zero (max 9999,99 \u20AC).");
      amtInp?.focus();
      return;
    }
    const normLabel = norm(label);
    const matching = adjustments.filter((a) => a.type === adjType && norm(a.label) === normLabel);
    let nextAdjustments;
    let wasMerged = false;
    if (matching.length > 0) {
      wasMerged = true;
      const sumMinor = matching.reduce((acc, a) => acc + Math.max(0, Number(a.amountMinor) || 0), 0) + amountMinor;
      const firstId = matching[0].id;
      nextAdjustments = [];
      for (const a of adjustments) {
        if (a.type === adjType && norm(a.label) === normLabel) {
          if (a.id === firstId) {
            nextAdjustments.push({ ...a, label, amountMinor: sumMinor, updatedAt: now() });
          }
        } else {
          nextAdjustments.push(a);
        }
      }
    } else {
      const newAdj = {
        id: uuid(),
        type: adjType,
        label,
        amountMinor,
        createdAt: now()
      };
      nextAdjustments = [...adjustments, newAdj];
    }
    const updated = {
      ...currentReceipt,
      adjustments: nextAdjustments,
      updatedAt: now()
    };
    await putOne("archivedReceipts", updated);
    const keepScroll = modalEl ? modalEl.scrollTop : 0;
    releaseModalKeyboard();
    state.currentModal = null;
    state.currentModalKeep = false;
    await openReceiptDetailWindow(currentReceipt.id, archiveOpts, { adjType, scrollTop: keepScroll });
    showToast(wasMerged
      ? (adjType === "add" ? "Aggiunta aggiornata" : "Detrazione aggiornata")
      : (adjType === "add" ? "Aggiunta salvata" : "Detrazione salvata"));
  };

  $("#addAdjBtn")?.addEventListener("click", commitAdjustment);
}
