// Archivio spese (scontrini immutabili), aggiunte/detrazioni cassa e riepilogo risparmio
import { state } from "./state.js";
import { SVG_CIRCLED_PLUS, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, assignUnit, esc, eurosFromInput, fmtQtyUnit, money, moneyPerUnit, now, productDisplayParts, searchNorm, storeChipHtml, uuid } from "./calculations.js";
import { activeItems, delOne, getAll, getOne, putOne, txDone } from "./storage.js";
import { attachSearchClear, bindSwipeDelete, closeModal, confirmDialog, modal, releaseModalKeyboard, selectAllOnFocus, showToast, swipeWrap } from "./ui.js";
import { currentSavedListId } from "./history.js";
import { openListMenu, renderList } from "./shoppingList.js";

const RECEIPT_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21V3Z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/></svg>';
const LOCK_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const ADJUSTMENT_PRESETS = {
  deduct: ["Buono fedelt\xE0", "Sconto cassa", "Buono pasto", "Arrotondamento"],
  add: ["Sacchetti", "Cauzione", "Arrotondamento"]
};

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

function buildReceiptSnapshot({ storeObj, storeId, itemsToArchive, purchaseDate, note, sourceListName, quickPricesMap, pMap, cMap, priceLookup }) {
  const ts = now();
  const storeNameSnapshot = storeObj ? storeObj.name : "Senza supermercato";
  const snapshotItems = itemsToArchive.map((item) => {
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

  snapshotItems.sort((a, b) =>
    a.categoryNameSnapshot.localeCompare(b.categoryNameSnapshot, "it", { sensitivity: "base" }) ||
    a.productNameSnapshot.localeCompare(b.productNameSnapshot, "it", { sensitivity: "base" })
  );

  return {
    id: uuid(),
    schemaVersion: 1,
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

export async function openArchiveWindow(opts = {}) {
  const [receiptsRaw, curItems, products] = await Promise.all([
    getAll("archivedReceipts"),
    activeItems(),
    getAll("products")
  ]);
  const pSet = new Set(products.map((p) => p.id));
  const validActiveItems = curItems.filter((i) => pSet.has(i.productId));
  const checkedCount = validActiveItems.filter((i) => i.checked).length;
  const receipts = sortReceiptsDesc(receiptsRaw);

  let selectedStoreKey = opts.storeFilter || "all";
  let searchQuery = opts.searchQuery || "";

  const storeFilterEntries = new Map();
  for (const r of receipts) {
    const key = r.storeNameSnapshot || "Senza supermercato";
    if (!storeFilterEntries.has(key)) storeFilterEntries.set(key, key);
  }
  const storeNames = [...storeFilterEntries.keys()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  if (selectedStoreKey !== "all" && !storeNames.includes(selectedStoreKey)) selectedStoreKey = "all";

  const activeSubtitle = validActiveItems.length
    ? `${validActiveItems.length} ${validActiveItems.length === 1 ? "articolo" : "articoli"} in lista \u00B7 ${checkedCount} ${checkedCount === 1 ? "spuntato" : "spuntati"}`
    : "La lista attiva \xE8 vuota";

  const filterBarHtml = receipts.length ? `
    <div class="archive-filter-bar">
      <select id="archiveStoreFilter" class="archive-store-select" aria-label="Filtra per supermercato">
        <option value="all"${selectedStoreKey === "all" ? " selected" : ""}>Tutti i supermercati (${receipts.length})</option>
        ${storeNames.map((name) => `<option value="${esc(name)}"${selectedStoreKey === name ? " selected" : ""}>${esc(name)}</option>`).join("")}
      </select>
      <input id="archiveSearchInput" type="search" class="search-input" placeholder="Cerca nota, supermercato o articolo\u2026" value="${esc(searchQuery)}" autocomplete="off" aria-label="Cerca nell'archivio spese">
    </div>` : "";

  const body = `<div class="saved-lists-sheet archive-sheet">
    <div class="saved-name-card archive-cta-card">
      <button type="button" class="btn btn-primary btn-block" id="archiveCurrentBtn" ${validActiveItems.length ? "" : "disabled"}>
        ${SVG_CIRCLED_PLUS}<span>Archivia spesa corrente</span>
      </button>
      <div class="archive-cta-sub">${esc(activeSubtitle)}</div>
    </div>
    ${filterBarHtml}
    <div class="saved-list-section">
      <div class="saved-list-head">
        <div class="saved-list-head-left">
          <span class="saved-list-icon">${RECEIPT_ICON_SVG}</span>
          <span class="saved-list-title">Spese archiviate</span>
          <span class="title-count-badge" id="archiveCountBadge">${receipts.length}</span>
        </div>
        <button type="button" class="header-icon trash-mini" id="delAllArchivedBtn" ${receipts.length ? "" : "disabled"} aria-label="Elimina tutte le spese archiviate" title="Elimina tutte le spese archiviate">${TRASH_OFFICE}</button>
      </div>
      <div id="archiveSummaryStrip" class="archive-summary-strip"${receipts.length ? "" : " hidden"}></div>
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
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Ogni spesa archiviata salva una fotografia immutabile di articoli e prezzi di quel giorno, separata per supermercato.<br>Tocca uno scontrino per vedere il dettaglio e gestire eventuali aggiunte o detrazioni di cassa. Scorri verso destra per eliminare.</div>`);
  }

  const container = $("#archivedReceiptsContainer");
  const summaryStrip = $("#archiveSummaryStrip");
  const countBadge = $("#archiveCountBadge");
  const storeSelect = $("#archiveStoreFilter");
  const searchInp = $("#archiveSearchInput");

  const paintReceipts = () => {
    const q = searchNorm(searchQuery);
    const filtered = receipts.filter((r) => {
      const storeLabel = r.storeNameSnapshot || "Senza supermercato";
      if (selectedStoreKey !== "all" && storeLabel !== selectedStoreKey) return false;
      if (!q) return true;
      const hay = [
        storeLabel,
        r.note || "",
        r.sourceListName || "",
        fmtIsoDate(r.purchaseDate, r.archivedAt),
        ...(r.items || []).map((it) => `${it.productNameSnapshot || ""} ${it.productBrandSnapshot || ""} ${it.categoryNameSnapshot || ""}`)
      ].join(" ");
      return searchNorm(hay).includes(q);
    });

    if (countBadge) countBadge.textContent = String(filtered.length);

    if (summaryStrip) {
      if (filtered.length) {
        let sumFinal = 0;
        let sumSavings = 0;
        for (const r of filtered) {
          const t = computeReceiptTotals(r);
          sumFinal += t.finalTotalMinor;
          if (t.hasListBaseline && t.netDiffVsListMinor > 0) sumSavings += t.netDiffVsListMinor;
        }
        summaryStrip.hidden = false;
        summaryStrip.innerHTML = `<span><strong>${filtered.length}</strong> ${filtered.length === 1 ? "scontrino" : "scontrini"} \u00B7 <strong>${money(sumFinal)}</strong></span>${sumSavings > 0 ? `<span class="archive-savings-pill">Risparmiati ${money(sumSavings)}</span>` : ""}`;
      } else {
        summaryStrip.hidden = true;
      }
    }

    if (!filtered.length) {
      container.innerHTML = `<div class="empty">${receipts.length ? "Nessuno scontrino corrisponde ai filtri." : "Nessuna spesa archiviata.<br>Tocca \u201CArchivia spesa corrente\u201D per salvare il tuo primo scontrino."}</div>`;
      return;
    }

    container.innerHTML = filtered.map((r) => {
      const t = computeReceiptTotals(r);
      const dt = fmtIsoDate(r.purchaseDate, r.archivedAt);
      const adjCount = (r.adjustments || []).length;
      const badges = [];
      if (t.hasListBaseline && t.netDiffVsListMinor > 0) {
        badges.push(`<span class="archive-mini-badge is-save">\u2212${money(t.netDiffVsListMinor)}</span>`);
      }
      if (adjCount > 0) {
        badges.push(`<span class="archive-mini-badge is-adj">${adjCount} ${adjCount === 1 ? "voce cassa" : "voci cassa"}</span>`);
      }
      if (t.missingPricesCount > 0) {
        badges.push(`<span class="archive-mini-badge is-warn">${t.missingPricesCount} N/D</span>`);
      }
      const noteText = r.note || r.sourceListName || "";
      return swipeWrap(`<div class="list-row compact saved-row archive-row" data-receipt-row="${r.id}">
        <div class="archive-row-main">
          <div class="archive-row-top">
            <span class="archive-row-store">${receiptStoreChip(r)}</span>
            <strong class="archive-row-total">${money(t.finalTotalMinor)}</strong>
          </div>
          <div class="archive-row-meta">
            <span>${dt} \u00B7 ${t.itemsCount} ${t.itemsCount === 1 ? "articolo" : "articoli"}</span>
            ${badges.length ? `<span class="archive-row-badges">${badges.join("")}</span>` : ""}
          </div>
          ${noteText ? `<div class="archive-row-note">${esc(noteText)}</div>` : ""}
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

  storeSelect?.addEventListener("change", () => {
    selectedStoreKey = storeSelect.value || "all";
    paintReceipts();
  });

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
    if (!receipts.length) return;
    const yes = await confirmDialog(
      "Elimina archivio spese",
      `Tutti i ${receipts.length} scontrini archiviati verranno eliminati definitivamente. Procedere comunque?`,
      "Elimina tutti",
      { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openArchiveWindow() }
    );
    if (!yes) return;
    const tx = state.db.transaction("archivedReceipts", "readwrite");
    tx.objectStore("archivedReceipts").clear();
    await txDone(tx);
    await openArchiveWindow();
    showToast("Archivio spese svuotato");
  });
}

export async function openArchiveCurrentListModal() {
  const [itemsRaw, products, cats, storesList, prices, curSavedId] = await Promise.all([
    activeItems(),
    getAll("products"),
    getAll("categories"),
    getAll("stores"),
    getAll("productPrices"),
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

  // Pre-select stores that have checked items; if none are checked anywhere, pre-select all
  const anyCheckedGlobal = items.some((i) => i.checked);
  const selectedStoreKeys = new Set(
    anyCheckedGlobal
      ? groups.filter((g) => g.items.some((i) => i.checked)).map((g) => g.key)
      : groups.map((g) => g.key)
  );
  let scopeMode = anyCheckedGlobal ? "checked" : "all";
  let removeArchivedAfter = false;
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

    <div class="archive-card" id="archiveScopeCard">
      <div class="archive-card-title">Articoli da includere</div>
      <label class="radio-opt archive-radio-opt" id="scopeCheckedOpt">
        <input type="radio" name="archiveScope" value="checked"${scopeMode === "checked" ? " checked" : ""}>
        <span><strong>Solo articoli acquistati (spuntati)</strong><small id="scopeCheckedDesc">Gli articoli non spuntati restano intatti nella lista.</small></span>
      </label>
      <label class="radio-opt archive-radio-opt" id="scopeAllOpt">
        <input type="radio" name="archiveScope" value="all"${scopeMode === "all" ? " checked" : ""}>
        <span><strong>Includi tutti gli articoli</strong><small id="scopeAllDesc">Archivia sia gli articoli spuntati sia quelli non spuntati.</small></span>
      </label>
      <label class="check-line archive-cleanup-opt">
        <input type="checkbox" id="archiveRemoveAfter">
        <span>Rimuovi gli articoli archiviati dalla lista attiva</span>
      </label>
    </div>

    <div id="archiveMissingBox" class="archive-card archive-warn-card" hidden></div>

    <div class="archive-card archive-meta-card">
      <div class="archive-meta-grid">
        <div class="field">
          <label for="archivePurchaseDate">Data spesa</label>
          <input id="archivePurchaseDate" type="date" value="${todayIsoDate()}">
        </div>
        <div class="field">
          <label for="archiveNoteInput">Nota <span class="label-hint">(facoltativa)</span></label>
          <input id="archiveNoteInput" type="text" maxlength="60" placeholder="${curSavedList ? esc(curSavedList.name) : "Es. Spesa settimanale"}" autocomplete="off">
        </div>
      </div>
    </div>

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

    const purchaseDate = ($("#archivePurchaseDate")?.value || "").trim() || todayIsoDate();
    const note = ($("#archiveNoteInput")?.value || "").trim();

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
        priceLookup
      })
    );

    const archivedItemIds = new Set();
    for (const entry of chosenGroups) {
      for (const it of entry.items) archivedItemIds.add(it.id);
    }

    const txStores = removeArchivedAfter ? ["archivedReceipts", "shoppingListItems"] : ["archivedReceipts"];
    const tx = state.db.transaction(txStores, "readwrite");
    const arOs = tx.objectStore("archivedReceipts");
    for (const rec of createdReceipts) arOs.put(rec);
    if (removeArchivedAfter) {
      const liOs = tx.objectStore("shoppingListItems");
      for (const id of archivedItemIds) liOs.delete(id);
    }
    await txDone(tx);

    if (removeArchivedAfter) {
      state.celebrationShownFor = "";
      if (state.page === "list") await renderList();
    }

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
  const scopeCheckedDesc = $("#scopeCheckedDesc");
  const scopeAllDesc = $("#scopeAllDesc");

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
    let candAllCount = 0;
    let candCheckedCount = 0;
    for (const g of candGroups) {
      candAllCount += g.items.length;
      candCheckedCount += g.items.filter((i) => i.checked).length;
    }
    const candUncheckedCount = candAllCount - candCheckedCount;

    if (checkedRadio) {
      checkedRadio.disabled = candCheckedCount === 0;
      if (candCheckedCount === 0 && scopeMode === "checked") {
        scopeMode = "all";
        if (allRadio) allRadio.checked = true;
      }
    }
    if (scopeCheckedDesc) {
      scopeCheckedDesc.textContent = candCheckedCount === 0
        ? "Nessun articolo spuntato nei supermercati selezionati."
        : (candUncheckedCount > 0
          ? `${candCheckedCount} spuntati archiviati; ${candUncheckedCount} non spuntati restano in lista.`
          : `Tutti i ${candCheckedCount} articoli selezionati sono gi\xE0 spuntati.`);
    }
    if (scopeAllDesc) {
      scopeAllDesc.textContent = `Include tutti i ${candAllCount} ${candAllCount === 1 ? "articolo" : "articoli"} dei supermercati selezionati.`;
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
                <div class="archive-nd-meta">${esc(group.storeName)} \u00B7 ${fmtQtyUnit(item.quantity, p.unit)} ${esc(assignUnit(p.unit))}</div>
              </div>
              <div class="archive-nd-input-wrap">
                <input type="text" inputmode="decimal" class="archive-nd-input" data-nd-item="${item.id}" placeholder="0,00" value="${esc(curVal)}" aria-label="Prezzo unitario per ${esc(dp.title)}">
                <span class="archive-nd-unit">\u20AC/${esc(assignUnit(p.unit))}</span>
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

  $("#archiveRemoveAfter")?.addEventListener("change", (e) => {
    removeArchivedAfter = !!e.target.checked;
  });

  refreshWizard();
}

export async function openReceiptDetailWindow(receiptId, archiveOpts = {}, detailState = {}) {
  const receipt = await getOne("archivedReceipts", receiptId);
  if (!receipt) {
    showToast("Scontrino non trovato.");
    await openArchiveWindow(archiveOpts);
    return;
  }

  const t = computeReceiptTotals(receipt);
  const dt = fmtIsoDate(receipt.purchaseDate, receipt.archivedAt);
  const adjustments = Array.isArray(receipt.adjustments) ? receipt.adjustments : [];
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  let adjType = detailState.adjType === "add" ? "add" : "deduct";

  const savingsBlockHtml = t.hasListBaseline ? (() => {
    const netPos = t.netDiffVsListMinor > 0;
    const netZero = t.netDiffVsListMinor === 0;
    const netClass = netPos ? "is-positive" : (netZero ? "is-neutral" : "is-negative");
    const netLabel = netPos
      ? "Risparmio reale rispetto al listino"
      : (netZero ? "In linea con il listino" : "Differenza rispetto al listino");
    const netSign = netPos ? `\u2212${money(t.netDiffVsListMinor)}` : (netZero ? money(0) : `+${money(Math.abs(t.netDiffVsListMinor))}`);
    const pctText = !netZero && t.listTotalMinor > 0 ? ` (${Math.abs(t.savingsPct).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%)` : "";
    const details = [];
    if (t.promoSavingsMinor > 0) details.push(`Promozioni articoli: \u2212${money(t.promoSavingsMinor)}`);
    else if (t.promoSavingsMinor < 0) details.push(`Variazione prezzi articoli: +${money(Math.abs(t.promoSavingsMinor))}`);
    if (t.deductionsMinor > 0) details.push(`Detrazioni/buoni cassa: \u2212${money(t.deductionsMinor)}`);
    if (t.additionsMinor > 0) details.push(`Aggiunte cassa: +${money(t.additionsMinor)}`);
    return `<div class="receipt-compare-box ${netClass}">
      <div class="receipt-compare-row">
        <span>Totale di listino articoli</span>
        <strong>${money(t.listTotalMinor)}</strong>
      </div>
      <div class="receipt-compare-row is-highlight">
        <span>${netLabel}</span>
        <strong>${netSign}${pctText}</strong>
      </div>
      ${details.length ? `<div class="receipt-compare-breakdown">${details.join(" \u00B7 ")}</div>` : ""}
    </div>`;
  })() : "";

  const adjRowsHtml = adjustments.length
    ? adjustments.map((adj) => {
        const isAdd = adj.type === "add";
        const sign = isAdd ? "+" : "\u2212";
        return `<div class="receipt-adj-row ${isAdd ? "is-add" : "is-deduct"}">
          <span class="receipt-adj-tag">${isAdd ? "+ Aggiunta" : "\u2212 Detrazione"}</span>
          <span class="receipt-adj-label">${esc(adj.label)}</span>
          <strong class="receipt-adj-amount">${sign}${money(adj.amountMinor)}</strong>
          <button type="button" class="receipt-adj-del" data-del-adj="${esc(adj.id)}" aria-label="Rimuovi ${esc(adj.label)}" title="Rimuovi">\xD7</button>
        </div>`;
      }).join("")
    : `<div class="receipt-adj-empty">Nessuna aggiunta o detrazione registrata.</div>`;

  const itemsRowsHtml = items.map((it) => {
    const qtyText = `${fmtQtyUnit(it.quantity, it.unitSnapshot)} ${esc(assignUnit(it.unitSnapshot))}`;
    const brandHtml = it.productBrandSnapshot ? `<span class="row-brand">${esc(it.productBrandSnapshot)}</span>` : "";
    let unitPriceHtml = "";
    if (it.priceMissing || it.effectiveUnitPriceMinor === null || it.effectiveUnitPriceMinor === undefined) {
      unitPriceHtml = `<span class="receipt-item-nd">prezzo N/D</span>`;
    } else if (it.isPromo && it.listUnitPriceMinor !== null && it.listUnitPriceMinor !== undefined && it.listUnitPriceMinor !== it.effectiveUnitPriceMinor) {
      unitPriceHtml = `<span class="receipt-item-unit-old">${moneyPerUnit(it.listUnitPriceMinor, it.unitSnapshot)}</span> <span class="receipt-item-unit-promo">${moneyPerUnit(it.effectiveUnitPriceMinor, it.unitSnapshot)}</span>`;
    } else {
      unitPriceHtml = `<span class="receipt-item-unit">${moneyPerUnit(it.effectiveUnitPriceMinor, it.unitSnapshot)}</span>`;
    }
    const totalHtml = it.priceMissing ? '<span class="is-nd">N/D</span>' : money(it.lineTotalMinor);
    return `<div class="receipt-item-row">
      <div class="receipt-item-top">
        <span class="receipt-item-name">${esc(it.productNameSnapshot)}</span>
        <span class="receipt-item-qty">${qtyText}</span>
      </div>
      ${brandHtml}
      <div class="receipt-item-bottom">
        <span class="receipt-item-cat">${esc(it.categoryNameSnapshot || "Senza reparto")} \u00B7 ${unitPriceHtml}</span>
        <strong class="receipt-item-total">${totalHtml}</strong>
      </div>
    </div>`;
  }).join("");

  const renderPresetsHtml = (type) => ADJUSTMENT_PRESETS[type].map((lbl) =>
    `<button type="button" class="receipt-preset-chip" data-adj-preset="${esc(lbl)}">${esc(lbl)}</button>`
  ).join("");

  const body = `<div class="saved-lists-sheet receipt-detail-sheet">
    <div class="receipt-hero-card">
      <div class="receipt-hero-head">
        <div class="receipt-hero-store">${receiptStoreChip(receipt, "store-chip-heading")}</div>
        <span class="receipt-hero-date">${dt}</span>
      </div>
      ${receipt.note ? `<div class="receipt-hero-note">${esc(receipt.note)}</div>` : ""}
      ${receipt.sourceListName && receipt.sourceListName !== receipt.note ? `<div class="receipt-hero-source">Lista origine: ${esc(receipt.sourceListName)}</div>` : ""}

      <div class="receipt-totals-box">
        <div class="receipt-total-line">
          <span>Subtotale articoli (${t.itemsCount})</span>
          <span>${money(t.itemsSubtotalMinor)}</span>
        </div>
        ${t.additionsMinor > 0 ? `<div class="receipt-total-line is-add"><span>Aggiunte</span><span>+${money(t.additionsMinor)}</span></div>` : ""}
        ${t.deductionsMinor > 0 ? `<div class="receipt-total-line is-deduct"><span>Detrazioni</span><span>\u2212${money(t.deductionsMinor)}</span></div>` : ""}
        <div class="receipt-total-line is-final">
          <span>Totale scontrino finale</span>
          <strong>${money(t.finalTotalMinor)}</strong>
        </div>
      </div>

      ${savingsBlockHtml}
      ${t.missingPricesCount > 0 ? `<div class="receipt-missing-note">${t.missingPricesCount} ${t.missingPricesCount === 1 ? "articolo archiviato" : "articoli archiviati"} con prezzo N/D (0,00 \u20AC).</div>` : ""}
    </div>

    <div class="archive-card receipt-adj-card">
      <div class="saved-list-head">
        <div class="saved-list-head-left">
          <span class="saved-list-title">Aggiunte e detrazioni cassa</span>
          <span class="title-count-badge">${adjustments.length}</span>
        </div>
      </div>
      <div class="receipt-adj-list" id="receiptAdjList">${adjRowsHtml}</div>
      <div class="receipt-adj-form">
        <div class="prod-seg prod-seg-2" role="tablist" aria-label="Tipo voce cassa">
          <button type="button" class="prod-seg-btn${adjType === "deduct" ? " active" : ""}" data-adj-type="deduct">\u2212 Detrazione</button>
          <button type="button" class="prod-seg-btn${adjType === "add" ? " active" : ""}" data-adj-type="add">+ Aggiunta</button>
        </div>
        <div class="receipt-presets" id="receiptAdjPresets">${renderPresetsHtml(adjType)}</div>
        <div class="receipt-adj-inputs">
          <input type="text" id="adjLabelInput" maxlength="40" placeholder="${adjType === "deduct" ? "Es. Buono fedelt\xE0, Sconto 10%" : "Es. Sacchetti, Cauzione"}" autocomplete="off" aria-label="Descrizione voce">
          <div class="receipt-adj-amt-wrap">
            <input type="text" inputmode="decimal" id="adjAmountInput" placeholder="0,00" autocomplete="off" aria-label="Importo in euro">
            <span>\u20AC</span>
          </div>
          <button type="button" class="btn btn-primary btn-small" id="addAdjBtn">Aggiungi</button>
        </div>
      </div>
    </div>

    <div class="saved-list-section receipt-items-section">
      <div class="saved-list-head">
        <div class="saved-list-head-left">
          <span class="saved-list-title">Articoli dello scontrino</span>
          <span class="title-count-badge">${items.length}</span>
        </div>
        <span class="receipt-immutable-badge" title="Gli articoli archiviati non possono essere modificati">${LOCK_ICON_SVG}<span>Immutabile</span></span>
      </div>
      <div class="receipt-items-list">${itemsRowsHtml}</div>
    </div>
  </div>`;

  modal("Dettaglio scontrino", body, [
    { label: "Indietro", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openArchiveWindow(archiveOpts); } },
    { label: "Elimina", class: "btn-danger", action: async () => {
      const yes = await confirmDialog(
        "Elimina scontrino",
        `Lo scontrino di <strong>${esc(receipt.storeNameSnapshot || "Senza supermercato")}</strong> del ${dt} verr\xE0 eliminato definitivamente. Procedere comunque?`,
        "Elimina",
        { overlay: true, cancelFirst: true, confirmClass: "btn-danger", themed: true, backdropClose: false }
      );
      if (!yes) return;
      await delOne("archivedReceipts", receipt.id);
      state.currentModal = null;
      state.currentModalKeep = false;
      await openArchiveWindow(archiveOpts);
      showToast("Scontrino eliminato");
    } }
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
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Gli articoli dello scontrino sono congelati alla data di archiviazione e non risentono di future modifiche al catalogo.<br>Puoi aggiungere o rimuovere aggiunte (es. sacchetti) e detrazioni (es. buoni o sconti cassa) in qualsiasi momento.</div>`);
  }

  const root = $("#modalRoot");
  const labelInp = $("#adjLabelInput");
  const amtInp = $("#adjAmountInput");
  const presetsWrap = $("#receiptAdjPresets");

  const bindPresetChips = () => {
    presetsWrap?.querySelectorAll("[data-adj-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (labelInp) labelInp.value = btn.dataset.adjPreset;
        amtInp?.focus();
      });
    });
  };
  bindPresetChips();

  root.querySelectorAll("[data-adj-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      adjType = btn.dataset.adjType === "add" ? "add" : "deduct";
      root.querySelectorAll("[data-adj-type]").forEach((b) => b.classList.toggle("active", b.dataset.adjType === adjType));
      if (presetsWrap) {
        presetsWrap.innerHTML = renderPresetsHtml(adjType);
        bindPresetChips();
      }
      if (labelInp) {
        labelInp.placeholder = adjType === "deduct" ? "Es. Buono fedelt\xE0, Sconto 10%" : "Es. Sacchetti, Cauzione";
      }
    });
  });

  if (amtInp) selectAllOnFocus(amtInp);

  const commitAdjustment = async () => {
    const label = (labelInp?.value || "").trim();
    const amtRaw = (amtInp?.value || "").trim();
    if (!label) {
      showToast("Inserisci una descrizione (es. Buono fedelt\xE0 o Sacchetti).");
      labelInp?.focus();
      return;
    }
    const amountMinor = eurosFromInput(amtRaw);
    if (amountMinor === null || Number.isNaN(amountMinor) || amountMinor <= 0) {
      showToast("Inserisci un importo valido maggiore di zero.");
      amtInp?.focus();
      return;
    }
    const newAdj = {
      id: uuid(),
      type: adjType,
      label,
      amountMinor,
      createdAt: now()
    };
    const updated = {
      ...receipt,
      adjustments: [...adjustments, newAdj],
      updatedAt: now()
    };
    await putOne("archivedReceipts", updated);
    const keepScroll = modalEl ? modalEl.scrollTop : 0;
    releaseModalKeyboard();
    state.currentModal = null;
    state.currentModalKeep = false;
    await openReceiptDetailWindow(receipt.id, archiveOpts, { adjType, scrollTop: keepScroll });
    showToast(adjType === "add" ? "Aggiunta salvata" : "Detrazione salvata");
  };

  $("#addAdjBtn")?.addEventListener("click", commitAdjustment);
  amtInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      commitAdjustment();
    }
  });
  labelInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      amtInp?.focus();
    }
  });

  root.querySelectorAll("[data-del-adj]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const adjId = btn.dataset.delAdj;
      const updated = {
        ...receipt,
        adjustments: adjustments.filter((a) => a.id !== adjId),
        updatedAt: now()
      };
      await putOne("archivedReceipts", updated);
      const keepScroll = modalEl ? modalEl.scrollTop : 0;
      state.currentModal = null;
      state.currentModalKeep = false;
      await openReceiptDetailWindow(receipt.id, archiveOpts, { adjType, scrollTop: keepScroll });
      showToast("Voce rimossa");
    });
  });
}
