// Archivio spese (dati economici immutabili, anagrafica e percorso dinamici), aggiunte/detrazioni cassa e riepilogo risparmio
import { state } from "./state.js";
import { PENCIL_SVG, SVG_CHK, SVG_CIRCLED_PLUS, SVG_FILTER_CLEAR, SVG_X, TRASH_OFFICE, infoBtn } from "./data.js";
import { $, assignUnit, displayUnit, esc, eurosFromInput, extractProductFields, fmtQtyUnit, formatProductNetParts, formatTitleWithNetHtml, isConfezionePackaging, isPiecePackUnit, money, moneyPerUnit, norm, now, parsePackPieces, parseQty, productDisplayParts, searchNorm, storeChipHtml, storeHasColors, uuid } from "./calculations.js";
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

const IT_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

function receiptIsoDate(r) {
  if (typeof r?.purchaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.purchaseDate)) return r.purchaseDate;
  if (r?.archivedAt) {
    const dt = new Date(r.archivedAt);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return "";
}

function fmtIsoDate(isoDate, fallbackIsoTs) {
  if (typeof isoDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(fallbackIsoTs || Date.now());
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtShortIsoDate(isoDate) {
  if (typeof isoDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y.slice(-2)}`;
  }
  return fmtIsoDate(isoDate);
}

function normalizeSnapshotPackUnit(u) {
  const raw = String(u || "").trim().toLowerCase();
  if (raw === "l") return "lt";
  if (raw === "pz.") return "pz";
  return raw || "pz";
}

export function extractSnapshotParts(it) {
  if (!it) {
    return { itemName: "Articolo", packaging: "confezione", packUnit: "pz", packQty: null, packPieces: null, netPart: "" };
  }
  if (it.itemNameSnapshot !== undefined) {
    const itemName = String(it.itemNameSnapshot || "").trim() || "Articolo";
    const packaging = it.packagingSnapshot === "sfuso" ? "sfuso" : "confezione";
    const packUnit = normalizeSnapshotPackUnit(it.packUnitSnapshot || it.unitSnapshot || "pz");
    const packQty = packaging === "sfuso"
      ? 1
      : (Number.isFinite(Number(it.packQtySnapshot)) && Number(it.packQtySnapshot) > 0 ? Math.round(Number(it.packQtySnapshot) * 1e3) / 1e3 : null);
    const rawPcs = packaging === "confezione" && !isPiecePackUnit(packUnit) ? parsePackPieces(it.packPiecesSnapshot) : null;
    const packPieces = Number.isInteger(rawPcs) && rawPcs > 1 && rawPcs <= 1000 ? rawPcs : null;
    const { netPart } = formatProductNetParts(packaging === "sfuso" ? 1 : packQty, packUnit, true, packaging, null);
    return { itemName, packaging, packUnit, packQty, packPieces, netPart };
  }
  const rawTitle = String(it.productNameSnapshot || "").trim();
  const dotParts = rawTitle.split(/\s*\u00B7\s*/);
  if (dotParts.length >= 2) {
    const netPart = dotParts[dotParts.length - 1].trim();
    const leftRaw = dotParts.slice(0, -1).join(" \u00B7 ").trim();
    let itemName = leftRaw || "Articolo";
    let packPieces = null;
    const pcsMatch = /^(.*?)\s+(\d+)pz$/i.exec(leftRaw);
    if (pcsMatch && pcsMatch[1].trim()) {
      const n = Number(pcsMatch[2]);
      if (Number.isInteger(n) && n > 1 && n <= 1000) {
        itemName = pcsMatch[1].trim();
        packPieces = n;
      }
    }
    const sfusoMatch = /^@(kg|g|lt|l|cl|ml|cm|m|pz\.?)$/i.exec(netPart);
    if (sfusoMatch) {
      const packUnit = normalizeSnapshotPackUnit(sfusoMatch[1]);
      return { itemName, packaging: "sfuso", packUnit, packQty: 1, packPieces: null, netPart: `@${packUnit}` };
    }
    const confMatch = /^(\d+(?:[.,]\d{1,3})?)(kg|g|lt|l|cl|ml|cm|m|pz\.?)$/i.exec(netPart);
    if (confMatch) {
      const packQty = parseQty(confMatch[1]);
      const packUnit = normalizeSnapshotPackUnit(confMatch[2]);
      const validQty = Number.isFinite(packQty) && packQty > 0 ? Math.round(packQty * 1e3) / 1e3 : null;
      return {
        itemName,
        packaging: "confezione",
        packUnit,
        packQty: validQty,
        packPieces: isPiecePackUnit(packUnit) ? null : packPieces,
        netPart
      };
    }
    const fallbackPackaging = it.packagingSnapshot === "sfuso" ? "sfuso" : (it.packagingSnapshot === "confezione" ? "confezione" : (isConfezionePackaging(null, it.unitSnapshot) ? "confezione" : "sfuso"));
    const fallbackUnit = normalizeSnapshotPackUnit(it.unitSnapshot || "pz");
    return { itemName, packaging: fallbackPackaging, packUnit: fallbackUnit, packQty: fallbackPackaging === "sfuso" ? 1 : null, packPieces, netPart };
  }
  const fallbackPackaging = it.packagingSnapshot === "sfuso" ? "sfuso" : (it.packagingSnapshot === "confezione" ? "confezione" : (isConfezionePackaging(null, it.unitSnapshot) ? "confezione" : "sfuso"));
  const fallbackUnit = normalizeSnapshotPackUnit(it.unitSnapshot || "pz");
  return {
    itemName: rawTitle || "Articolo",
    packaging: fallbackPackaging,
    packUnit: fallbackUnit,
    packQty: fallbackPackaging === "sfuso" ? 1 : null,
    packPieces: null,
    netPart: ""
  };
}

export function resolveReceiptStore(receipt, sMap = null) {
  const liveStore = receipt?.storeId && sMap ? sMap[receipt.storeId] : null;
  if (liveStore) {
    return {
      storeId: liveStore.id,
      name: liveStore.name,
      bgColor: liveStore.bgColor || null,
      textColor: liveStore.textColor || null,
      isNone: false,
      isLive: true
    };
  }
  const snapName = receipt?.storeNameSnapshot || "Senza supermercato";
  const isNone = !receipt?.storeId && snapName === "Senza supermercato";
  return {
    storeId: receipt?.storeId || null,
    name: snapName,
    bgColor: receipt?.storeBgColorSnapshot || null,
    textColor: receipt?.storeTextColorSnapshot || null,
    isNone,
    isLive: false
  };
}

export function resolveReceiptItem(it, pMap = null, cMap = null) {
  const snap = extractSnapshotParts(it);
  const liveProd = it?.productId && pMap ? pMap[it.productId] : null;
  if (liveProd) {
    const lf = extractProductFields(liveProd);
    const itemName = (lf.itemName || liveProd.name || snap.itemName || "Articolo").trim();
    const brand = String((lf.isLegacy ? (liveProd.brand || it?.productBrandSnapshot) : lf.brand) || "").trim();
    const isSfuso = snap.packaging === "sfuso";
    const netPart = snap.netPart;
    let effectivePackPieces = null;
    if (!isSfuso && !isPiecePackUnit(snap.packUnit)) {
      if (lf.packaging === "confezione" && !isPiecePackUnit(lf.packUnit)) {
        effectivePackPieces = Number.isInteger(lf.packPieces) && lf.packPieces > 1 && lf.packPieces <= 1000 ? lf.packPieces : null;
      } else {
        effectivePackPieces = snap.packPieces;
      }
    }
    const piecesPart = effectivePackPieces ? `${effectivePackPieces}pz` : "";
    const left = [itemName, piecesPart].filter(Boolean).join(" ");
    const resolvedTitle = (left && netPart)
      ? `${left} \u00B7 ${netPart}`
      : (left || netPart || it.productNameSnapshot || "Articolo");
    const resolvedTitleHtml = (left || netPart)
      ? formatTitleWithNetHtml(itemName, netPart, isSfuso, piecesPart)
      : formatReceiptItemNameHtml(it.productNameSnapshot || "Articolo");
    const liveCat = liveProd.categoryId && cMap ? cMap[liveProd.categoryId] : null;
    return {
      ...it,
      resolvedTitle,
      resolvedTitleHtml,
      resolvedItemName: itemName,
      resolvedBrand: brand,
      resolvedPackPieces: effectivePackPieces,
      resolvedCategoryId: liveCat ? liveCat.id : null,
      resolvedCategoryName: liveCat ? liveCat.name : "Senza reparto",
      categoryIsNone: !liveCat,
      isLiveProduct: true
    };
  }
  const title = it?.productNameSnapshot || "Articolo";
  const brand = String(it?.productBrandSnapshot || "").trim();
  const liveCat = it?.categoryId && cMap ? cMap[it.categoryId] : null;
  const resolvedCategoryName = liveCat ? liveCat.name : (it?.categoryNameSnapshot || "Senza reparto");
  const categoryIsNone = liveCat ? false : (!it?.categoryNameSnapshot || it.categoryNameSnapshot === "Senza reparto");
  return {
    ...it,
    resolvedTitle: title,
    resolvedTitleHtml: formatReceiptItemNameHtml(title),
    resolvedItemName: snap.itemName,
    resolvedBrand: brand,
    resolvedPackPieces: snap.packPieces,
    resolvedCategoryId: liveCat ? liveCat.id : (it?.categoryId || null),
    resolvedCategoryName,
    categoryIsNone,
    isLiveProduct: false
  };
}

export function sortResolvedReceiptItems(resolvedItems, storeId, sMap, routes = []) {
  if (!Array.isArray(resolvedItems) || resolvedItems.length <= 1) return resolvedItems || [];
  const hasLiveStore = !!(storeId && sMap && sMap[storeId]);
  if (storeId && !hasLiveStore) {
    return [...resolvedItems];
  }
  const routePosition = (sid, catId) => {
    if (!sid || !catId) return 99999;
    return routes.find((r) => r.storeId === sid && r.categoryId === catId)?.position ?? 99999;
  };
  return [...resolvedItems].sort((a, b) => {
    if (hasLiveStore) {
      const d = routePosition(storeId, a.resolvedCategoryId) - routePosition(storeId, b.resolvedCategoryId);
      if (d) return d;
    }
    const ca = a.categoryIsNone ? "" : (a.resolvedCategoryName || "");
    const cb = b.categoryIsNone ? "" : (b.resolvedCategoryName || "");
    return ca.localeCompare(cb, "it", { sensitivity: "base" }) ||
      (a.resolvedTitle || "").localeCompare(b.resolvedTitle || "", "it", { sensitivity: "base" });
  });
}

function productOrphanMatchKey({ itemName, brand, packaging, packUnit, packQty, fallbackTitle = "" }) {
  const pack = packaging === "sfuso" ? "sfuso" : "confezione";
  const u = normalizeSnapshotPackUnit(packUnit);
  const q = pack === "sfuso"
    ? "1"
    : (Number.isFinite(Number(packQty)) && Number(packQty) > 0 ? String(Math.round(Number(packQty) * 1e3) / 1e3) : "");
  const nName = norm(itemName);
  const nBrand = norm(brand);
  if (!q && fallbackTitle) return `legacy|${norm(fallbackTitle)}|${nBrand}|${pack}|${u}`;
  return `${nName}|${nBrand}|${pack}|${u}|${q}`;
}

export async function countArchivedReceiptsForProduct(productId) {
  if (!productId) return 0;
  const receipts = await getAll("archivedReceipts");
  let count = 0;
  for (const r of receipts) {
    if ((r.items || []).some((it) => it.productId === productId)) count++;
  }
  return count;
}

export async function countArchivedReceiptsForCategory(categoryId) {
  if (!categoryId) return 0;
  const [receipts, products] = await Promise.all([getAll("archivedReceipts"), getAll("products")]);
  const pMap = Object.fromEntries(products.map((p) => [p.id, p]));
  let count = 0;
  for (const r of receipts) {
    const hit = (r.items || []).some((it) => {
      const liveProd = it.productId ? pMap[it.productId] : null;
      const effCatId = liveProd ? (liveProd.categoryId || null) : (it.categoryId || null);
      return effCatId === categoryId;
    });
    if (hit) count++;
  }
  return count;
}

export async function countArchivedReceiptsForStore(storeId) {
  if (!storeId) return 0;
  const receipts = await getAll("archivedReceipts");
  return receipts.filter((r) => r.storeId === storeId).length;
}

export function prepareFrozenReceiptsForProductDelete(productIdsSet, pMap, cMap, receipts) {
  if (!productIdsSet || !productIdsSet.size) return [];
  const modified = [];
  for (const r of receipts) {
    let changed = false;
    const nextItems = (r.items || []).map((it) => {
      if (!it.productId || !productIdsSet.has(it.productId)) return it;
      const snap = extractSnapshotParts(it);
      const res = resolveReceiptItem(it, pMap, cMap);
      changed = true;
      return {
        ...it,
        productNameSnapshot: res.resolvedTitle,
        itemNameSnapshot: res.resolvedItemName,
        productBrandSnapshot: res.resolvedBrand,
        categoryId: res.resolvedCategoryId,
        categoryNameSnapshot: res.resolvedCategoryName,
        packUnitSnapshot: snap.packUnit,
        packQtySnapshot: snap.packQty,
        packPiecesSnapshot: res.resolvedPackPieces
      };
    });
    if (changed) modified.push({ ...r, items: nextItems });
  }
  return modified;
}

export function prepareFrozenReceiptsForCategoryDelete(categoryIdsSet, pMap, cMap, receipts) {
  if (!categoryIdsSet || !categoryIdsSet.size) return [];
  const modified = [];
  for (const r of receipts) {
    let changed = false;
    const nextItems = (r.items || []).map((it) => {
      const liveProd = it.productId ? pMap[it.productId] : null;
      const effCatId = liveProd ? (liveProd.categoryId || null) : (it.categoryId || null);
      if (effCatId && categoryIdsSet.has(effCatId)) {
        const catName = cMap[effCatId]?.name || it.categoryNameSnapshot || "Senza reparto";
        if (it.categoryId !== effCatId || it.categoryNameSnapshot !== catName) {
          changed = true;
          return { ...it, categoryId: effCatId, categoryNameSnapshot: catName };
        }
      } else if (liveProd && it.categoryId && categoryIdsSet.has(it.categoryId)) {
        const liveCatName = liveProd.categoryId && cMap[liveProd.categoryId] ? cMap[liveProd.categoryId].name : "Senza reparto";
        changed = true;
        return { ...it, categoryId: liveProd.categoryId || null, categoryNameSnapshot: liveCatName };
      }
      return it;
    });
    if (changed) modified.push({ ...r, items: nextItems });
  }
  return modified;
}

export function prepareFrozenReceiptsForStoreDelete(storeIdsSet, pMap, cMap, sMap, routes, receipts) {
  if (!storeIdsSet || !storeIdsSet.size) return [];
  const modified = [];
  for (const r of receipts) {
    if (!r.storeId || !storeIdsSet.has(r.storeId)) continue;
    const st = sMap[r.storeId];
    if (!st) continue;
    const rawItems = Array.isArray(r.items) ? r.items : [];
    const indexed = rawItems.map((it) => ({ raw: it, resolved: resolveReceiptItem(it, pMap, cMap) }));
    const routePosition = (sid, catId) => {
      if (!sid || !catId) return 99999;
      return routes.find((rt) => rt.storeId === sid && rt.categoryId === catId)?.position ?? 99999;
    };
    indexed.sort((a, b) => {
      const d = routePosition(st.id, a.resolved.resolvedCategoryId) - routePosition(st.id, b.resolved.resolvedCategoryId);
      if (d) return d;
      const ca = a.resolved.categoryIsNone ? "" : (a.resolved.resolvedCategoryName || "");
      const cb = b.resolved.categoryIsNone ? "" : (b.resolved.resolvedCategoryName || "");
      return ca.localeCompare(cb, "it", { sensitivity: "base" }) ||
        (a.resolved.resolvedTitle || "").localeCompare(b.resolved.resolvedTitle || "", "it", { sensitivity: "base" });
    });
    const nextItems = indexed.map(({ raw }) => ({ ...raw, storeNameSnapshot: st.name }));
    modified.push({
      ...r,
      storeNameSnapshot: st.name,
      storeBgColorSnapshot: st.bgColor || null,
      storeTextColorSnapshot: st.textColor || null,
      items: nextItems
    });
  }
  return modified;
}

export function findOrphanProductMatch({ itemName, brand, packaging, packUnit, packQty }, existingProducts, receipts) {
  const liveIds = new Set(existingProducts.map((p) => p.id));
  const targetKey = productOrphanMatchKey({ itemName, brand, packaging, packUnit, packQty });
  const sorted = sortReceiptsDesc(receipts);
  const matchedReceiptIds = new Set();
  const orphanIds = [];
  const seenOrphan = new Set();
  for (const r of sorted) {
    for (const it of (r.items || [])) {
      if (!it.productId || liveIds.has(it.productId)) continue;
      const snap = extractSnapshotParts(it);
      const itemKey = productOrphanMatchKey({
        itemName: snap.itemName,
        brand: it.productBrandSnapshot || "",
        packaging: snap.packaging,
        packUnit: snap.packUnit,
        packQty: snap.packQty,
        fallbackTitle: it.productNameSnapshot || ""
      });
      if (itemKey === targetKey) {
        matchedReceiptIds.add(r.id);
        if (!seenOrphan.has(it.productId)) {
          seenOrphan.add(it.productId);
          orphanIds.push(it.productId);
        }
      }
    }
  }
  if (!matchedReceiptIds.size || !orphanIds.length) return null;
  return { primaryId: orphanIds[0], orphanIds, receiptCount: matchedReceiptIds.size };
}

export function findOrphanCategoryMatch(name, existingCategories, receipts) {
  const liveIds = new Set(existingCategories.map((c) => c.id));
  const targetNorm = norm(name);
  if (!targetNorm) return null;
  const sorted = sortReceiptsDesc(receipts);
  const matchedReceiptIds = new Set();
  const orphanIds = [];
  const seenOrphan = new Set();
  const productIds = new Set();
  for (const r of sorted) {
    for (const it of (r.items || [])) {
      if (!it.categoryId || liveIds.has(it.categoryId)) continue;
      if (norm(it.categoryNameSnapshot) === targetNorm) {
        matchedReceiptIds.add(r.id);
        if (!seenOrphan.has(it.categoryId)) {
          seenOrphan.add(it.categoryId);
          orphanIds.push(it.categoryId);
        }
        if (it.productId) productIds.add(it.productId);
      }
    }
  }
  if (!matchedReceiptIds.size || !orphanIds.length) return null;
  return { primaryId: orphanIds[0], orphanIds, receiptCount: matchedReceiptIds.size, productIds: [...productIds] };
}

export function findOrphanStoreMatch(name, existingStores, receipts) {
  const liveIds = new Set(existingStores.map((s) => s.id));
  const targetNorm = norm(name);
  if (!targetNorm) return null;
  const sorted = sortReceiptsDesc(receipts);
  const matchedReceiptIds = new Set();
  const orphanIds = [];
  const seenOrphan = new Set();
  let bgColor = null;
  let textColor = null;
  for (const r of sorted) {
    if (!r.storeId || liveIds.has(r.storeId)) continue;
    if (norm(r.storeNameSnapshot) === targetNorm) {
      matchedReceiptIds.add(r.id);
      if (!seenOrphan.has(r.storeId)) {
        seenOrphan.add(r.storeId);
        orphanIds.push(r.storeId);
      }
      if (!bgColor && r.storeBgColorSnapshot) bgColor = r.storeBgColorSnapshot;
      if (!textColor && r.storeTextColorSnapshot) textColor = r.storeTextColorSnapshot;
    }
  }
  if (!matchedReceiptIds.size || !orphanIds.length) return null;
  return { primaryId: orphanIds[0], orphanIds, receiptCount: matchedReceiptIds.size, bgColor, textColor };
}

export async function promptArchiveRelink({ entityLabel, entityName, receiptCount }) {
  const speseTxt = receiptCount === 1 ? "1 spesa archiviata" : `${receiptCount} spese archiviate`;
  return await confirmDialog(
    "Ricollega storico spese",
    `${entityLabel} <strong>${esc(entityName)}</strong> risulta presente in <strong>${speseTxt}</strong> in precedenza.<br><br>Vuoi ricollegarlo allo storico per mantenere unite le statistiche?`,
    "Ricollega",
    { overlay: true, cancelFirst: true, confirmClass: "btn-primary", cancelLabel: "Crea separato", themed: true, backdropClose: false }
  );
}

export function deleteStaleTombstonesInTx(tx, entityType, entityIds, allTombstones) {
  if (!entityIds || !entityIds.length) return;
  const idSet = new Set(entityIds);
  const os = tx.objectStore("tombstones");
  for (const t of allTombstones) {
    if (t.entityType === entityType && idSet.has(t.entityId)) os.delete(t.id);
  }
}

export function unifyOrphanProductIdsInTx(tx, primaryId, orphanIds, receipts) {
  if (!orphanIds || orphanIds.length <= 1) return;
  const otherSet = new Set(orphanIds.filter((id) => id !== primaryId));
  if (!otherSet.size) return;
  const os = tx.objectStore("archivedReceipts");
  for (const r of receipts) {
    let changed = false;
    const nextItems = (r.items || []).map((it) => {
      if (it.productId && otherSet.has(it.productId)) {
        changed = true;
        return { ...it, productId: primaryId };
      }
      return it;
    });
    if (changed) os.put({ ...r, items: nextItems });
  }
}

export function unifyOrphanCategoryIdsInTx(tx, primaryId, orphanIds, receipts) {
  if (!orphanIds || orphanIds.length <= 1) return;
  const otherSet = new Set(orphanIds.filter((id) => id !== primaryId));
  if (!otherSet.size) return;
  const os = tx.objectStore("archivedReceipts");
  for (const r of receipts) {
    let changed = false;
    const nextItems = (r.items || []).map((it) => {
      if (it.categoryId && otherSet.has(it.categoryId)) {
        changed = true;
        return { ...it, categoryId: primaryId };
      }
      return it;
    });
    if (changed) os.put({ ...r, items: nextItems });
  }
}

export function unifyOrphanStoreIdsInTx(tx, primaryId, orphanIds, receipts) {
  if (!orphanIds || orphanIds.length <= 1) return;
  const otherSet = new Set(orphanIds.filter((id) => id !== primaryId));
  if (!otherSet.size) return;
  const os = tx.objectStore("archivedReceipts");
  for (const r of receipts) {
    if (r.storeId && otherSet.has(r.storeId)) {
      const nextItems = (r.items || []).map((it) => (it.storeId && otherSet.has(it.storeId) ? { ...it, storeId: primaryId } : it));
      os.put({ ...r, storeId: primaryId, items: nextItems });
    }
  }
}

function receiptStoreChip(receipt, extraClass = "", sMap = null) {
  const rs = resolveReceiptStore(receipt, sMap);
  if (rs.isNone) {
    return '<span class="it">Senza supermercato</span>';
  }
  const virtualStore = {
    name: rs.name || "Supermercato",
    bgColor: rs.bgColor || null,
    textColor: rs.textColor || null
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
    const f = extractProductFields(p);
    const cat = p?.categoryId ? cMap[p.categoryId] : null;
    const quickPrice = quickPricesMap.has(item.id) ? quickPricesMap.get(item.id) : null;
    const pricing = resolveActiveItemPricing(item, priceLookup, quickPrice);
    const packQtySnapshot = f.packaging === "sfuso"
      ? 1
      : (Number.isFinite(Number(p?.packQty)) && Number(p.packQty) > 0 ? Math.round(Number(p.packQty) * 1e3) / 1e3 : null);
    const packPiecesSnapshot = f.packaging === "confezione" && !isPiecePackUnit(f.packUnit) ? f.packPieces : null;
    return {
      productId: item.productId,
      productNameSnapshot: dp.title || p?.name || "Articolo",
      itemNameSnapshot: f.itemName || dp.title || p?.name || "Articolo",
      productBrandSnapshot: dp.brand || "",
      categoryId: p?.categoryId || null,
      categoryNameSnapshot: cat?.name || "Senza reparto",
      unitSnapshot: p?.unit || "pz",
      packagingSnapshot: p?.packaging || f.packaging,
      packUnitSnapshot: f.packUnit || p?.unit || "pz",
      packQtySnapshot,
      packPiecesSnapshot,
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
  const brandText = (it.resolvedBrand !== undefined ? it.resolvedBrand : (it.productBrandSnapshot || "")).trim();
  const brandHtml = brandText ? `<div class="row-brand receipt-item-brand">${esc(brandText)}</div>` : "";
  const titleHtml = it.resolvedTitleHtml !== undefined ? it.resolvedTitleHtml : formatReceiptItemNameHtml(it.productNameSnapshot);
  const catText = it.resolvedCategoryName !== undefined ? it.resolvedCategoryName : (it.categoryNameSnapshot || "Senza reparto");
  const catIsNone = it.categoryIsNone !== undefined ? it.categoryIsNone : (!it.categoryNameSnapshot || it.categoryNameSnapshot === "Senza reparto");
  const catHtml = catIsNone ? `<span class="it">${esc(catText)}</span>` : esc(catText);
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
      <span class="receipt-item-name">${titleHtml}</span>
    </div>
    ${brandHtml}
    <div class="receipt-item-bottom">
      <div class="receipt-item-meta">
        <div class="receipt-item-cat">${catHtml}</div>
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
  const [receiptsRaw, curItems, products, cats, storesList] = await Promise.all([
    getAll("archivedReceipts"),
    activeItems(),
    getAll("products"),
    getAll("categories"),
    getAll("stores")
  ]);
  const pMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const cMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const sMap = Object.fromEntries(storesList.map((s) => [s.id, s]));
  const validActiveItems = curItems.filter((i) => !!pMap[i.productId]);
  const receipts = sortReceiptsDesc(receiptsRaw);

  const SEARCH_FIELDS = {
    receipt: {
      key: "receipt",
      shortLabel: "Spesa",
      label: "Nome spesa",
      placeholder: "Cerca nome spesa\u2026",
      ariaLabel: "Cerca per nome spesa nell'archivio spese",
      maxLength: 20
    },
    category: {
      key: "category",
      shortLabel: "Reparto",
      label: "Nome reparto",
      placeholder: "Cerca nome reparto\u2026",
      ariaLabel: "Cerca per nome reparto nell'archivio spese",
      maxLength: 25
    },
    brand: {
      key: "brand",
      shortLabel: "Marca",
      label: "Nome marca",
      placeholder: "Cerca nome marca\u2026",
      ariaLabel: "Cerca per nome marca nell'archivio spese",
      maxLength: 25
    },
    item: {
      key: "item",
      shortLabel: "Articolo",
      label: "Nome articolo",
      placeholder: "Cerca nome articolo\u2026",
      ariaLabel: "Cerca per nome articolo nell'archivio spese",
      maxLength: 25
    }
  };

  let selectedStoreKey = opts.storeFilter || "all";
  let searchField = Object.prototype.hasOwnProperty.call(SEARCH_FIELDS, opts.searchField) ? opts.searchField : "receipt";
  let searchQuery = (opts.searchQuery || "").slice(0, SEARCH_FIELDS[searchField].maxLength);
  const initDf = opts.dateFilter && typeof opts.dateFilter === "object" ? opts.dateFilter : {};
  let dateFilter = {
    mode: ["all", "month", "range", "day"].includes(initDf.mode) ? initDf.mode : "all",
    month: typeof initDf.month === "string" && /^\d{4}-\d{2}$/.test(initDf.month) ? initDf.month : "",
    from: typeof initDf.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(initDf.from) ? initDf.from : "",
    to: typeof initDf.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(initDf.to) ? initDf.to : "",
    day: typeof initDf.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(initDf.day) ? initDf.day : ""
  };

  const latestReceiptIso = receipts.length ? (receiptIsoDate(receipts[0]) || todayIsoDate()) : todayIsoDate();
  const availableYearsSet = new Set([String(new Date().getFullYear())]);
  for (const r of receipts) {
    const y = receiptIsoDate(r).slice(0, 4);
    if (/^\d{4}$/.test(y)) availableYearsSet.add(y);
  }
  if (dateFilter.month && /^\d{4}-\d{2}$/.test(dateFilter.month)) availableYearsSet.add(dateFilter.month.slice(0, 4));
  const availableYears = [...availableYearsSet].sort((a, b) => b.localeCompare(a));

  const isDateFilterActive = () => {
    if (dateFilter.mode === "month") return /^\d{4}-\d{2}$/.test(dateFilter.month);
    if (dateFilter.mode === "day") return /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.day);
    if (dateFilter.mode === "range") return /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.from) || /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.to);
    return false;
  };

  const getDateFilterLabel = (compact = false) => {
    if (dateFilter.mode === "month" && /^\d{4}-\d{2}$/.test(dateFilter.month)) {
      const [y, m] = dateFilter.month.split("-");
      const mName = IT_MONTHS[Number(m) - 1] || m;
      return compact ? `${mName.slice(0, 3)} ${y}` : `${mName} ${y}`;
    }
    if (dateFilter.mode === "day" && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.day)) {
      return fmtIsoDate(dateFilter.day);
    }
    if (dateFilter.mode === "range") {
      const hasFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.from);
      const hasTo = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.to);
      if (hasFrom && hasTo) {
        const [lo, hi] = dateFilter.from <= dateFilter.to ? [dateFilter.from, dateFilter.to] : [dateFilter.to, dateFilter.from];
        return compact ? `${fmtShortIsoDate(lo)}\u2013${fmtShortIsoDate(hi)}` : `${fmtIsoDate(lo)} \u2013 ${fmtIsoDate(hi)}`;
      }
      if (hasFrom) return compact ? `Dal ${fmtShortIsoDate(dateFilter.from)}` : `Dal ${fmtIsoDate(dateFilter.from)}`;
      if (hasTo) return compact ? `Al ${fmtShortIsoDate(dateFilter.to)}` : `Fino al ${fmtIsoDate(dateFilter.to)}`;
    }
    return "Tutte le date";
  };

  const matchesDateFilter = (r) => {
    if (!isDateFilterActive()) return true;
    const iso = receiptIsoDate(r);
    if (!iso) return false;
    if (dateFilter.mode === "month") return iso.startsWith(dateFilter.month);
    if (dateFilter.mode === "day") return iso === dateFilter.day;
    if (dateFilter.mode === "range") {
      const hasFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.from);
      const hasTo = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter.to);
      if (hasFrom && hasTo) {
        const [lo, hi] = dateFilter.from <= dateFilter.to ? [dateFilter.from, dateFilter.to] : [dateFilter.to, dateFilter.from];
        return iso >= lo && iso <= hi;
      }
      if (hasFrom) return iso >= dateFilter.from;
      if (hasTo) return iso <= dateFilter.to;
    }
    return true;
  };

  const currentArchiveOpts = () => ({ storeFilter: selectedStoreKey, searchField, searchQuery, dateFilter: { ...dateFilter } });

  const receiptStoreKey = (r) => {
    const rs = resolveReceiptStore(r, sMap);
    if (rs.isNone) return "__none__";
    if (rs.isLive) return `live:${rs.storeId}`;
    return `snap:${norm(rs.name)}`;
  };

  const liveNormNames = new Set();
  const storeFilterMap = new Map();
  for (const r of receipts) {
    const rs = resolveReceiptStore(r, sMap);
    const key = receiptStoreKey(r);
    if (rs.isLive) liveNormNames.add(norm(rs.name));
    if (!storeFilterMap.has(key)) {
      storeFilterMap.set(key, {
        key,
        name: rs.name,
        bgColor: rs.bgColor || null,
        textColor: rs.textColor || null,
        isNone: rs.isNone,
        isLive: rs.isLive
      });
    }
  }
  const storeEntries = [...storeFilterMap.values()].map((info) => {
    const hasNameCollision = !info.isNone && !info.isLive && liveNormNames.has(norm(info.name));
    const displayName = hasNameCollision ? `${info.name} (archivio)` : info.name;
    return { ...info, displayName };
  }).sort((a, b) => {
    if (a.isNone && !b.isNone) return 1;
    if (!a.isNone && b.isNone) return -1;
    return a.displayName.localeCompare(b.displayName, "it", { sensitivity: "base" });
  });
  const storeEntryByKey = new Map(storeEntries.map((e) => [e.key, e]));
  if (selectedStoreKey !== "all" && !storeEntryByKey.has(selectedStoreKey)) selectedStoreKey = "all";

  const storeFilterOptions = storeEntries.map((info) => {
    const html = info.isNone
      ? '<span style="font-style:italic">Senza supermercato</span>'
      : (storeHasColors(info) ? storeChipHtml({ ...info, name: info.displayName }) : "");
    return { id: info.key, label: info.displayName, html, disabled: false };
  });
  const allStoresLabel = "Tutti i supermercati";

  const initMonthParts = (dateFilter.month || latestReceiptIso.slice(0, 7)).split("-");
  const initMonthYear = initMonthParts[0] || availableYears[0];
  const initMonthNum = initMonthParts[1] || "01";
  const monthOptsHtml = IT_MONTHS.map((name, idx) => {
    const mm = String(idx + 1).padStart(2, "0");
    return `<option value="${mm}"${mm === initMonthNum ? " selected" : ""}>${name}</option>`;
  }).join("");
  const yearOptsHtml = availableYears.map((y) => `<option value="${y}"${y === initMonthYear ? " selected" : ""}>${y}</option>`).join("");
  const curSearchMeta = SEARCH_FIELDS[searchField];
  const searchScopeOptsHtml = Object.values(SEARCH_FIELDS).map((sf) => `
    <button type="button" class="archive-search-scope-opt${sf.key === searchField ? " is-selected" : ""}" data-search-field="${sf.key}" role="option" aria-selected="${sf.key === searchField ? "true" : "false"}">
      <span>${sf.label}</span>
      <span class="archive-scope-check" aria-hidden="true">${SVG_CHK}</span>
    </button>`).join("");

  const filterBarHtml = receipts.length ? `
    <div class="archive-filter-bar">
      <div class="archive-filter-head">
        <span class="prod-filters-title">Filtra per</span>
        <button type="button" class="filter-clear archive-filter-clear dim" id="resetArchiveFilters" aria-label="Azzera tutti i filtri" title="Azzera tutti i filtri" disabled>${SVG_FILTER_CLEAR}</button>
      </div>
      <div class="store-filter-wrap archive-date-filter-wrap" id="archiveDateFilterWrap">
        <button type="button" class="store-filter-trigger archive-date-trigger${isDateFilterActive() ? " has-filter" : ""}" id="archiveDateFilterTrigger" aria-haspopup="dialog" aria-expanded="false">
          <span class="archive-date-trigger-content">
            <span class="archive-date-trigger-ico" aria-hidden="true">${CALENDAR_ICON_SVG}</span>
            <span id="archiveDateFilterSummary">${esc(getDateFilterLabel())}</span>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="store-filter-chevron" style="width:17px;height:17px;color:#174f86"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="store-filter-menu archive-date-filter-menu" id="archiveDateFilterMenu" role="dialog" aria-label="Filtra spese per data" hidden>
          <div class="archive-date-modes" role="tablist" aria-label="Tipo di filtro data">
            <button type="button" class="archive-date-mode-btn${dateFilter.mode === "all" ? " active" : ""}" data-date-mode="all" role="tab" aria-selected="${dateFilter.mode === "all" ? "true" : "false"}">Tutte</button>
            <button type="button" class="archive-date-mode-btn${dateFilter.mode === "range" ? " active" : ""}" data-date-mode="range" role="tab" aria-selected="${dateFilter.mode === "range" ? "true" : "false"}">Intervallo</button>
            <button type="button" class="archive-date-mode-btn${dateFilter.mode === "month" ? " active" : ""}" data-date-mode="month" role="tab" aria-selected="${dateFilter.mode === "month" ? "true" : "false"}">Mese</button>
            <button type="button" class="archive-date-mode-btn${dateFilter.mode === "day" ? " active" : ""}" data-date-mode="day" role="tab" aria-selected="${dateFilter.mode === "day" ? "true" : "false"}">Giorno</button>
          </div>
          <div class="archive-date-panel" id="archiveDatePanelMonth"${dateFilter.mode === "month" ? "" : " hidden"}>
            <div class="archive-date-month-grid">
              <select id="archiveDateMonthSelect" class="archive-date-select" aria-label="Mese">${monthOptsHtml}</select>
              <select id="archiveDateYearSelect" class="archive-date-select" aria-label="Anno">${yearOptsHtml}</select>
            </div>
          </div>
          <div class="archive-date-panel" id="archiveDatePanelRange"${dateFilter.mode === "range" ? "" : " hidden"}>
            <div class="archive-date-field-row">
              <label for="archiveDateFrom">Dal</label>
              <input id="archiveDateFrom" type="date" class="archive-date-input" value="${esc(dateFilter.from)}" aria-label="Data inizio intervallo">
            </div>
            <div class="archive-date-field-row">
              <label for="archiveDateTo">Al</label>
              <input id="archiveDateTo" type="date" class="archive-date-input" value="${esc(dateFilter.to)}" aria-label="Data fine intervallo">
            </div>
          </div>
          <div class="archive-date-panel" id="archiveDatePanelDay"${dateFilter.mode === "day" ? "" : " hidden"}>
            <div class="archive-date-field-row">
              <label for="archiveDateDay">Data</label>
              <input id="archiveDateDay" type="date" class="archive-date-input" value="${esc(dateFilter.day)}" aria-label="Data precisa">
            </div>
          </div>
          <div class="archive-date-menu-foot" id="archiveDateMenuFoot"${dateFilter.mode === "all" ? " hidden" : ""}>
            <button type="button" class="btn btn-primary btn-small archive-date-apply-btn" id="archiveDateApplyBtn">Applica</button>
          </div>
        </div>
      </div>
      ${singleFilterHtml({ id: "archiveStoreFilter", allLabel: allStoresLabel, options: storeFilterOptions, selectedValue: selectedStoreKey, searchMaxLength: 20, searchUppercase: true })}
      <div class="archive-search-combo${searchQuery.trim() ? " has-query" : ""}" id="archiveSearchCombo">
        <div class="store-filter-wrap archive-search-scope-wrap" id="archiveSearchScopeWrap">
          <button type="button" class="store-filter-trigger archive-search-scope-btn" id="archiveSearchScopeBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Cerca per: ${esc(curSearchMeta.label)}" title="Scegli il campo di ricerca">
            <span class="archive-scope-label-box"><span class="archive-scope-sizer" aria-hidden="true">Articolo</span><span id="archiveSearchScopeLabel">${esc(curSearchMeta.shortLabel)}</span></span>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="store-filter-chevron"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="store-filter-menu archive-search-scope-menu" id="archiveSearchScopeMenu" role="listbox" aria-label="Cerca per" hidden>
            ${searchScopeOptsHtml}
          </div>
        </div>
        <input id="archiveSearchInput" type="search" class="search-input archive-combo-input" maxlength="${curSearchMeta.maxLength}" placeholder="${esc(curSearchMeta.placeholder)}" value="${esc(searchQuery)}" autocomplete="off" aria-label="${esc(curSearchMeta.ariaLabel)}">
      </div>
    </div>` : "";

  const body = `<div class="saved-lists-sheet archive-sheet">
    <div class="archive-sticky-stack">
      ${filterBarHtml}
      <div class="saved-list-head list-section-banner archive-sticky-banner">
        <div class="saved-list-head-left">
          <span class="saved-list-icon archive-section-icon">${RECEIPT_ICON_SVG}</span>
          <span class="saved-list-title" id="archiveSectionTitle">I miei scontrini</span>
          <span class="title-count-badge" id="archiveCountBadge">${receipts.length}</span>
        </div>
        <button type="button" class="header-icon trash-mini" id="delAllArchivedBtn" ${receipts.length ? "" : "disabled"} aria-label="Elimina tutte le spese archiviate" title="Elimina tutte le spese archiviate">${TRASH_OFFICE}</button>
      </div>
    </div>
    <div class="saved-list-section archive-list-body">
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
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Clicca su una spesa archiviata per vederne i dettagli.<br>Scorri verso destra per eliminarla.<br>Puoi anche filtrare l'elenco per nome Spesa, Reparto, Marca o Articolo.</div>`);
  }

  const container = $("#archivedReceiptsContainer");
  const countBadge = $("#archiveCountBadge");
  const searchInp = $("#archiveSearchInput");
  const searchCombo = $("#archiveSearchCombo");
  const searchScopeBtn = $("#archiveSearchScopeBtn");
  const searchScopeLabel = $("#archiveSearchScopeLabel");
  const searchScopeMenu = $("#archiveSearchScopeMenu");
  const delAllBtn = $("#delAllArchivedBtn");
  const resetFiltersBtn = $("#resetArchiveFilters");
  const dateTrigger = $("#archiveDateFilterTrigger");
  const dateSummary = $("#archiveDateFilterSummary");
  const dateMenu = $("#archiveDateFilterMenu");
  const dateMonthSel = $("#archiveDateMonthSelect");
  const dateYearSel = $("#archiveDateYearSelect");
  const dateFromInp = $("#archiveDateFrom");
  const dateToInp = $("#archiveDateTo");
  const dateDayInp = $("#archiveDateDay");
  const datePanelMonth = $("#archiveDatePanelMonth");
  const datePanelRange = $("#archiveDatePanelRange");
  const datePanelDay = $("#archiveDatePanelDay");
  const dateMenuFoot = $("#archiveDateMenuFoot");

  const getFilteredReceipts = () => receipts.filter((r) => (selectedStoreKey === "all" || receiptStoreKey(r) === selectedStoreKey) && matchesDateFilter(r));

  const getFilteredState = () => {
    const q = searchNorm(searchQuery);
    const baseReceipts = getFilteredReceipts();
    if (q && searchField !== "receipt") {
      const tokens = q.split(" ").filter(Boolean);
      const matchedItems = [];
      const matchedReceiptMap = new Map();
      for (const r of baseReceipts) {
        for (const it of (r.items || [])) {
          const resolved = resolveReceiptItem(it, pMap, cMap);
          const itemHay = searchField === "category"
            ? searchNorm(resolved.resolvedCategoryName || "")
            : searchField === "brand"
              ? searchNorm(resolved.resolvedBrand || "")
              : searchNorm(resolved.resolvedItemName || resolved.resolvedTitle || it.productNameSnapshot || "");
          if (itemHay && tokens.every((tok) => itemHay.includes(tok))) {
            matchedItems.push({ receipt: r, item: resolved });
            if (!matchedReceiptMap.has(r.id)) matchedReceiptMap.set(r.id, r);
          }
        }
      }
      const targetReceipts = [...matchedReceiptMap.values()];
      return { q, matchedItems, visibleReceipts: targetReceipts, targetReceipts };
    }
    const visibleReceipts = (q && searchField === "receipt")
      ? baseReceipts.filter((r) => {
          const tokens = q.split(" ").filter(Boolean);
          const noteHay = searchNorm(r.note || "");
          return noteHay && tokens.every((tok) => noteHay.includes(tok));
        })
      : baseReceipts;
    return { q, matchedItems: null, visibleReceipts, targetReceipts: visibleReceipts };
  };

  const syncDateFilterUI = () => {
    const active = isDateFilterActive();
    if (dateTrigger) dateTrigger.classList.toggle("has-filter", active);
    if (dateSummary) dateSummary.textContent = getDateFilterLabel();
    if (dateMenu) {
      dateMenu.querySelectorAll("[data-date-mode]").forEach((btn) => {
        const sel = btn.dataset.dateMode === dateFilter.mode;
        btn.classList.toggle("active", sel);
        btn.setAttribute("aria-selected", String(sel));
      });
    }
    if (datePanelMonth) datePanelMonth.hidden = dateFilter.mode !== "month";
    if (datePanelRange) datePanelRange.hidden = dateFilter.mode !== "range";
    if (datePanelDay) datePanelDay.hidden = dateFilter.mode !== "day";
    if (dateMenuFoot) dateMenuFoot.hidden = dateFilter.mode === "all";
    if (dateFilter.mode === "month" && /^\d{4}-\d{2}$/.test(dateFilter.month)) {
      const [y, m] = dateFilter.month.split("-");
      if (dateMonthSel) dateMonthSel.value = m;
      if (dateYearSel) dateYearSel.value = y;
    }
    if (dateFromInp && dateFromInp.value !== dateFilter.from) dateFromInp.value = dateFilter.from;
    if (dateToInp && dateToInp.value !== dateFilter.to) dateToInp.value = dateFilter.to;
    if (dateDayInp && dateDayInp.value !== dateFilter.day) dateDayInp.value = dateFilter.day;
  };

  const syncResetBtn = () => {
    if (searchCombo) searchCombo.classList.toggle("has-query", !!searchQuery.trim());
    if (!resetFiltersBtn) return;
    const hasAny = selectedStoreKey !== "all" || isDateFilterActive() || !!searchQuery.trim();
    resetFiltersBtn.disabled = !hasAny;
    resetFiltersBtn.classList.toggle("dim", !hasAny);
  };

  const paintReceipts = () => {
    const { q, matchedItems, visibleReceipts, targetReceipts } = getFilteredState();
    const dateActive = isDateFilterActive();
    const hasAnyFilter = selectedStoreKey !== "all" || dateActive || !!q;
    syncResetBtn();
    if (delAllBtn) {
      delAllBtn.disabled = targetReceipts.length === 0;
      delAllBtn.classList.toggle("dim", targetReceipts.length === 0);
      const delLabel = !hasAnyFilter
        ? "Elimina tutte le spese archiviate"
        : (targetReceipts.length === 1 ? "Elimina lo scontrino filtrato" : "Elimina gli scontrini filtrati");
      delAllBtn.title = delLabel;
      delAllBtn.setAttribute("aria-label", delLabel);
    }

    if (matchedItems) {
      if (countBadge) countBadge.textContent = String(matchedItems.length);
      if (!matchedItems.length) {
        const emptyMsg = searchField === "category"
          ? "Nessun articolo di questo reparto trovato nell'archivio spese."
          : searchField === "brand"
            ? "Nessun articolo di questa marca trovato nell'archivio spese."
            : "Nessun articolo trovato nell'archivio spese.";
        container.innerHTML = `<div class="empty">${emptyMsg}</div>`;
        return;
      }
      container.innerHTML = matchedItems.map(({ receipt: r, item: it }) => {
        const dt = fmtIsoDate(r.purchaseDate, r.archivedAt);
        const topMetaHtml = `<div class="archive-search-item-head">
          <span class="archive-search-item-store">${receiptStoreChip(r, "", sMap)}</span>
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
          openReceiptDetailWindow(row.dataset.openReceipt, currentArchiveOpts());
        });
      });
      return;
    }

    if (countBadge) countBadge.textContent = String(visibleReceipts.length);

    if (!visibleReceipts.length) {
      const emptyReceiptMsg = !receipts.length
        ? "Nessuna spesa archiviata.<br>Usa \u201CArchivia spesa corrente\u201D dal menu della lista per salvare il tuo primo scontrino."
        : (q && searchField === "receipt" ? "Nessuna spesa trovata con questo nome." : "Nessuno scontrino corrisponde ai filtri.");
      container.innerHTML = `<div class="empty">${emptyReceiptMsg}</div>`;
      return;
    }

    container.innerHTML = visibleReceipts.map((r) => {
      const t = computeReceiptTotals(r);
      const dt = fmtIsoDate(r.purchaseDate, r.archivedAt);
      const noteText = r.note || "";
      return swipeWrap(`<div class="list-row compact saved-row archive-row" data-receipt-row="${r.id}">
        <div class="archive-row-grid">
          <div class="archive-row-left">
            <span class="archive-row-store">${receiptStoreChip(r, "", sMap)}</span>
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
        openReceiptDetailWindow(row.dataset.receiptRow, currentArchiveOpts());
      });
    });

    bindSwipeDelete(container, "[data-receipt-row]", async (row) => {
      const rec = receipts.find((x) => x.id === row.dataset.receiptRow);
      if (!rec) return false;
      const dt = fmtIsoDate(rec.purchaseDate, rec.archivedAt);
      const rs = resolveReceiptStore(rec, sMap);
      const yes = await confirmDialog(
        "Elimina scontrino",
        `Lo scontrino di <strong>${esc(rs.name || "Senza supermercato")}</strong> del ${dt} verr\xE0 eliminato definitivamente.<br>Procedere comunque?`,
        "Elimina",
        { closeButton: false, backdropClose: false, keepModalOnClose: true, keepOnConfirm: true, onClose: () => openArchiveWindow(currentArchiveOpts()) }
      );
      if (!yes) return false;
      await delOne("archivedReceipts", rec.id);
      await openArchiveWindow(currentArchiveOpts());
      showToast("Scontrino eliminato");
    });
  };

  syncDateFilterUI();
  paintReceipts();

  if (receipts.length) {
    wireSingleFilter("archiveStoreFilter", {
      searchMaxLength: 20,
      searchUppercase: true,
      onSelect: (val) => {
        selectedStoreKey = val || "all";
        updateSingleFilterUI("archiveStoreFilter", { allLabel: allStoresLabel, options: storeFilterOptions, selectedValue: selectedStoreKey });
        paintReceipts();
      }
    });
  }

  const closeDateMenu = () => {
    if (dateMenu) dateMenu.hidden = true;
    dateTrigger?.setAttribute("aria-expanded", "false");
  };

  if (dateTrigger && dateMenu) {
    dateTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = dateMenu.hidden;
      document.querySelectorAll(".custom-dropdown-menu").forEach((m) => {
        m.hidden = true;
        m.classList.remove("drop-up");
      });
      document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
      document.querySelectorAll(".store-filter-menu").forEach((m) => {
        if (m !== dateMenu) m.hidden = true;
      });
      document.querySelectorAll(".store-filter-trigger").forEach((t) => {
        if (t !== dateTrigger) t.setAttribute("aria-expanded", "false");
      });
      dateMenu.hidden = !willOpen;
      dateTrigger.setAttribute("aria-expanded", String(willOpen));
    });
    dateMenu.addEventListener("click", (e) => e.stopPropagation());

    dateMenu.querySelectorAll("[data-date-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextMode = btn.dataset.dateMode || "all";
        dateFilter.mode = nextMode;
        if (nextMode === "all") {
          dateFilter.month = "";
          dateFilter.from = "";
          dateFilter.to = "";
          dateFilter.day = "";
          syncDateFilterUI();
          paintReceipts();
          closeDateMenu();
          return;
        }
        if (nextMode === "month") {
          const y = dateYearSel?.value || latestReceiptIso.slice(0, 4);
          const m = dateMonthSel?.value || latestReceiptIso.slice(5, 7);
          dateFilter.month = `${y}-${m}`;
        } else if (nextMode === "day" && !dateFilter.day) {
          dateFilter.day = latestReceiptIso;
        }
        syncDateFilterUI();
        paintReceipts();
      });
    });

    const syncMonthFromSelects = () => {
      if (!dateYearSel || !dateMonthSel) return;
      dateFilter.mode = "month";
      dateFilter.month = `${dateYearSel.value}-${dateMonthSel.value}`;
      syncDateFilterUI();
      paintReceipts();
    };
    dateMonthSel?.addEventListener("change", syncMonthFromSelects);
    dateYearSel?.addEventListener("change", syncMonthFromSelects);

    const syncRangeFromInputs = () => {
      dateFilter.mode = "range";
      dateFilter.from = (dateFromInp?.value || "").trim();
      dateFilter.to = (dateToInp?.value || "").trim();
      syncDateFilterUI();
      paintReceipts();
    };
    dateFromInp?.addEventListener("change", syncRangeFromInputs);
    dateFromInp?.addEventListener("input", syncRangeFromInputs);
    dateToInp?.addEventListener("change", syncRangeFromInputs);
    dateToInp?.addEventListener("input", syncRangeFromInputs);

    const syncDayFromInput = () => {
      dateFilter.mode = "day";
      dateFilter.day = (dateDayInp?.value || "").trim();
      syncDateFilterUI();
      paintReceipts();
    };
    dateDayInp?.addEventListener("change", syncDayFromInput);
    dateDayInp?.addEventListener("input", syncDayFromInput);

    $("#archiveDateApplyBtn")?.addEventListener("click", () => {
      closeDateMenu();
    });
  }

  resetFiltersBtn?.addEventListener("click", () => {
    selectedStoreKey = "all";
    dateFilter = { mode: "all", month: "", from: "", to: "", day: "" };
    searchQuery = "";
    updateSingleFilterUI("archiveStoreFilter", { allLabel: allStoresLabel, options: storeFilterOptions, selectedValue: "all" });
    syncDateFilterUI();
    closeDateMenu();
    document.querySelectorAll(".archive-filter-bar .store-filter-menu").forEach((m) => { m.hidden = true; });
    document.querySelectorAll(".archive-filter-bar .store-filter-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    if (searchInp) {
      searchInp.value = "";
      searchInp.dispatchEvent(new Event("input"));
    } else {
      paintReceipts();
    }
  });

  const closeSearchScopeMenu = () => {
    if (searchScopeMenu) searchScopeMenu.hidden = true;
    searchScopeBtn?.setAttribute("aria-expanded", "false");
  };

  const applySearchField = (nextField, { focusInput = false } = {}) => {
    const meta = SEARCH_FIELDS[nextField] || SEARCH_FIELDS.receipt;
    const fieldChanged = meta.key !== searchField;
    searchField = meta.key;
    if (searchScopeLabel) searchScopeLabel.textContent = meta.shortLabel;
    searchScopeBtn?.setAttribute("aria-label", `Cerca per: ${meta.label}`);
    searchScopeMenu?.querySelectorAll("[data-search-field]").forEach((opt) => {
      const sel = opt.dataset.searchField === searchField;
      opt.classList.toggle("is-selected", sel);
      opt.setAttribute("aria-selected", String(sel));
    });
    if (fieldChanged) searchQuery = "";
    if (searchInp) {
      searchInp.maxLength = meta.maxLength;
      searchInp.placeholder = meta.placeholder;
      searchInp.setAttribute("aria-label", meta.ariaLabel);
      if (fieldChanged && searchInp.value !== "") {
        searchInp.value = "";
        searchInp.dispatchEvent(new Event("input"));
      } else if (searchInp.value.length > meta.maxLength) {
        searchInp.value = searchInp.value.slice(0, meta.maxLength);
        searchQuery = searchInp.value;
      }
    }
    closeSearchScopeMenu();
    paintReceipts();
    if (focusInput) searchInp?.focus();
  };

  if (searchScopeBtn && searchScopeMenu) {
    searchScopeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = searchScopeMenu.hidden;
      document.querySelectorAll(".custom-dropdown-menu").forEach((m) => {
        m.hidden = true;
        m.classList.remove("drop-up");
      });
      document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
      document.querySelectorAll(".store-filter-menu").forEach((m) => {
        if (m !== searchScopeMenu) m.hidden = true;
      });
      document.querySelectorAll(".store-filter-trigger").forEach((t) => {
        if (t !== searchScopeBtn) t.setAttribute("aria-expanded", "false");
      });
      searchScopeMenu.hidden = !willOpen;
      searchScopeBtn.setAttribute("aria-expanded", String(willOpen));
    });
    searchScopeMenu.addEventListener("click", (e) => e.stopPropagation());
    searchScopeMenu.querySelectorAll("[data-search-field]").forEach((opt) => {
      opt.addEventListener("click", () => {
        applySearchField(opt.dataset.searchField, { focusInput: true });
      });
    });
  }

  if (searchInp) {
    attachSearchClear(searchInp, () => {
      searchQuery = "";
      paintReceipts();
    });
    const onSearchInput = () => {
      const maxLen = (SEARCH_FIELDS[searchField] || SEARCH_FIELDS.receipt).maxLength;
      if (searchInp.value.length > maxLen) searchInp.value = searchInp.value.slice(0, maxLen);
      searchQuery = searchInp.value;
      paintReceipts();
    };
    searchInp.addEventListener("input", onSearchInput);
    searchInp.addEventListener("search", onSearchInput);
    searchInp.addEventListener("change", onSearchInput);
  }

  $("#delAllArchivedBtn")?.addEventListener("click", async () => {
    const { q, targetReceipts } = getFilteredState();
    if (!targetReceipts.length) return;
    const dateActive = isDateFilterActive();
    const qTrim = searchQuery.trim();
    const hasQuery = !!q;
    const isAll = selectedStoreKey === "all" && !dateActive && !hasQuery;
    const selStoreLabel = storeEntryByKey.get(selectedStoreKey)?.displayName || selectedStoreKey;
    const dateLbl = getDateFilterLabel();
    let msg;
    if (isAll) {
      msg = targetReceipts.length === 1
        ? "L'unico scontrino archiviato verr\xE0 eliminato definitivamente. Procedere comunque?"
        : `Tutti i ${targetReceipts.length} scontrini archiviati verranno eliminati definitivamente. Procedere comunque?`;
    } else {
      const scopeParts = [];
      if (selectedStoreKey !== "all") scopeParts.push(`di <strong>${esc(selStoreLabel)}</strong>`);
      if (dateActive) scopeParts.push(`(${esc(dateLbl)})`);
      if (hasQuery) {
        const fieldLbl = (SEARCH_FIELDS[searchField] || SEARCH_FIELDS.receipt).label.toLowerCase();
        scopeParts.push(`corrispondenti a ${esc(fieldLbl)} \u201C${esc(qTrim)}\u201D`);
      }
      const scopeTxt = scopeParts.join(" ");
      msg = targetReceipts.length === 1
        ? `Lo scontrino filtrato ${scopeTxt} verr\xE0 eliminato definitivamente. Procedere comunque?`
        : `I ${targetReceipts.length} scontrini filtrati ${scopeTxt} verranno eliminati definitivamente. Procedere comunque?`;
    }
    const dlgTitle = isAll
      ? "Elimina archivio spese"
      : (targetReceipts.length === 1 ? "Elimina scontrino" : "Elimina scontrini filtrati");
    const yes = await confirmDialog(
      dlgTitle,
      msg,
      isAll ? (targetReceipts.length === 1 ? "Elimina" : "Elimina tutti") : "Elimina",
      { overlay: true, closeButton: false, backdropClose: false }
    );
    if (!yes) return;
    const tx = state.db.transaction("archivedReceipts", "readwrite");
    const os = tx.objectStore("archivedReceipts");
    for (const r of targetReceipts) os.delete(r.id);
    await txDone(tx);
    state.currentModal = null;
    state.currentModalKeep = false;
    await openArchiveWindow({
      storeFilter: "all",
      searchField,
      searchQuery: "",
      dateFilter: { mode: "all", month: "", from: "", to: "", day: "" }
    });
    showToast(isAll
      ? "Archivio spese svuotato"
      : (targetReceipts.length === 1 ? "Scontrino filtrato eliminato" : "Scontrini filtrati eliminati"));
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
    openListMenu();
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

  const sourceListName = curSavedList?.name ? curSavedList.name.trim() : "";
  const sourceListHtml = sourceListName
    ? `<span class="archive-source-list-val">${esc(sourceListName)}</span>`
    : '<span class="archive-source-list-val is-unnamed">Senza nome</span>';

  const body = `<div class="saved-lists-sheet archive-wizard-sheet">
    <div class="archive-card archive-single-store-bar archive-source-list-bar">
      <span class="archive-single-lbl">Lista di origine</span>
      ${sourceListHtml}
    </div>
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
    { label: "Annulla", class: "btn-plain", action: () => { state.currentModal = null; state.currentModalKeep = false; openListMenu(); } },
    { label: "Archivia", class: "btn-primary", action: doArchive }
  ], {
    closeButton: true,
    backdropClose: false,
    alignTop: true,
    keepModalOnClose: true,
    themed: true,
    onClose: () => openListMenu()
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
  const [receipt, products, cats, storesList, routes] = await Promise.all([
    getOne("archivedReceipts", receiptId),
    getAll("products"),
    getAll("categories"),
    getAll("stores"),
    getAll("storeCategoryRoutes")
  ]);
  if (!receipt) {
    showToast("Scontrino non trovato.");
    await openArchiveWindow(archiveOpts);
    return;
  }

  const pMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const cMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const sMap = Object.fromEntries(storesList.map((s) => [s.id, s]));

  let currentReceipt = receipt;
  const resolvedStore = resolveReceiptStore(currentReceipt, sMap);
  const t = computeReceiptTotals(currentReceipt);
  const dt = fmtIsoDate(currentReceipt.purchaseDate, currentReceipt.archivedAt);
  const adjustments = Array.isArray(currentReceipt.adjustments) ? currentReceipt.adjustments : [];
  const rawItems = Array.isArray(currentReceipt.items) ? currentReceipt.items : [];
  const items = sortResolvedReceiptItems(
    rawItems.map((it) => resolveReceiptItem(it, pMap, cMap)),
    currentReceipt.storeId,
    sMap,
    routes
  );
  let adjType = detailState.adjType === "deduct" ? "deduct" : "add";
  let selectedPreset = "";

  const totalAdjCount = adjustments.length;
  const netAdjMinor = t.additionsMinor - t.deductionsMinor;
  const netAdjClass = totalAdjCount === 0
    ? "is-empty"
    : (netAdjMinor > 0 ? "is-add" : (netAdjMinor < 0 ? "is-deduct" : "is-neutral"));
  const netAdjText = totalAdjCount === 0
    ? "0,00 \u20AC"
    : (netAdjMinor > 0
      ? `+${money(netAdjMinor)}`
      : (netAdjMinor < 0 ? `\u2212${money(Math.abs(netAdjMinor))}` : money(0)));

  const itemsRowsHtml = items.map((it) => renderReceiptItemRowHtml(it)).join("");

  const fmtEditableAmt = (minor) => (Math.max(0, Number(minor) || 0) / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false
  });

  const renderAllAdjCardRowsHtml = () => {
    if (!adjustments.length) return "";
    return adjustments.map((adj) => {
      const isAdd = adj.type === "add";
      const sign = isAdd ? "+" : "\u2212";
      const amt = Math.max(0, Number(adj.amountMinor) || 0);
      const amtFormatted = fmtEditableAmt(amt);
      return swipeWrap(`<div class="receipt-adj-item-compact ${isAdd ? "is-add" : "is-deduct"}" data-adj-row-id="${esc(adj.id)}">
        <div class="receipt-adj-row-main">
          <div class="receipt-adj-row-left">
            <span class="receipt-adj-compact-name">${esc(adj.label)}</span>
            <button type="button" class="row-edit-inline receipt-adj-edit-btn" data-adj-edit-id="${esc(adj.id)}" aria-label="Modifica importo ${esc(adj.label)}" title="Modifica importo">${PENCIL_SVG}</button>
          </div>
          <strong class="receipt-adj-compact-amount ${isAdd ? "is-add" : "is-deduct"}">${sign}${money(amt)}</strong>
        </div>
        <div class="receipt-adj-inline-edit" data-adj-editor-for="${esc(adj.id)}" hidden>
          <div class="receipt-adj-edit-field ${isAdd ? "is-add" : "is-deduct"}">
            <span class="receipt-adj-sign ${isAdd ? "is-add" : "is-deduct"}" aria-hidden="true">${sign}</span>
            <input type="text" inputmode="decimal" enterkeyhint="done" class="receipt-adj-edit-input" data-adj-edit-input="${esc(adj.id)}" maxlength="7" value="${esc(amtFormatted)}" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" aria-label="Nuovo importo per ${esc(adj.label)}">
            <span class="receipt-adj-eur">\u20AC</span>
          </div>
          <button type="button" class="receipt-adj-edit-action is-cancel" data-adj-edit-cancel="${esc(adj.id)}" aria-label="Annulla modifica" title="Annulla">${SVG_X}</button>
          <button type="button" class="receipt-adj-edit-action is-save" data-adj-edit-save="${esc(adj.id)}" aria-label="Salva importo" title="Salva">${SVG_CHK}</button>
        </div>
      </div>`, "swipe-receipt-adj");
    }).join("");
  };

  const adjCardRowsHtml = renderAllAdjCardRowsHtml();

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

  const renderPresetOptionsHtml = (type) => {
    const placeholder = type === "deduct" ? "Detrai voce" : "Aggiungi voce";
    const sortedPresets = [...(ADJUSTMENT_PRESETS[type] || [])].sort((a, b) =>
      a.localeCompare(b, "it", { sensitivity: "base" })
    );
    const opts = sortedPresets.map((lbl) => {
      const isUsed = adjustments.some((a) => a.type === type && norm(a.label) === norm(lbl));
      return `<option value="${esc(lbl)}"${isUsed ? " disabled" : ""}${!isUsed && selectedPreset === lbl ? " selected" : ""}>${esc(lbl)}</option>`;
    }).join("");
    return `<option value=""${!selectedPreset ? " selected" : ""}>${placeholder}</option>${opts}`;
  };

  const body = `<div class="saved-lists-sheet receipt-detail-sheet">
    <div class="receipt-hero-sticky">
      <div class="receipt-hero-card">
        <div class="receipt-hero-head">
          <div class="receipt-hero-store">${receiptStoreChip(currentReceipt, "store-chip-heading", sMap)}</div>
          <span class="receipt-hero-date">${dt}</span>
        </div>
        <div class="name-box receipt-hero-note-box">
          <input id="receiptNoteInput" type="text" maxlength="20" value="${esc(currentReceipt.note || "")}" placeholder="Nome spesa" autocomplete="off" aria-label="Nome spesa">
          <button type="button" class="name-no" id="receiptNoteNo" aria-label="Annulla" title="Annulla">${SVG_X}</button>
          <button type="button" class="name-ok" id="receiptNoteOk" aria-label="Conferma nome" title="Conferma nome">${SVG_CHK}</button>
        </div>
      </div>
    </div>

    <div class="archive-card receipt-adj-card receipt-adj-compact" id="receiptAdjCard">
      <div class="receipt-adj-c-head">
        <div class="receipt-adj-c-head-left">
          <span class="receipt-adj-c-title">Aggiunte e detrazioni</span>
          <span class="title-count-badge receipt-adj-c-count">${totalAdjCount}</span>
        </div>
        <span class="receipt-adj-c-net ${netAdjClass}">${netAdjText}</span>
      </div>
      <div class="receipt-tabs-wrap ${adjType === "deduct" ? "is-deduct" : "is-add"}" id="receiptTabsWrap">
        <div class="receipt-adj-c-row1">
          <div class="receipt-adj-c-switch" role="tablist" aria-label="Tipo voce scontrino">
            <button type="button" role="tab" aria-selected="${adjType === "add" ? "true" : "false"}" aria-label="Aggiunta" title="Aggiunta" class="receipt-tab-btn is-add${adjType === "add" ? " active" : ""}" data-adj-type="add">+</button>
            <button type="button" role="tab" aria-selected="${adjType === "deduct" ? "true" : "false"}" aria-label="Detrazione" title="Detrazione" class="receipt-tab-btn is-deduct${adjType === "deduct" ? " active" : ""}" data-adj-type="deduct">\u2212</button>
          </div>
          <div class="receipt-adj-c-select-wrap">
            <select id="adjPresetSelect" class="receipt-adj-c-select" aria-label="${adjType === "deduct" ? "Detrai voce" : "Aggiungi voce"}">${renderPresetOptionsHtml(adjType)}</select>
          </div>
        </div>
        <div class="receipt-adj-inputs">
          <div class="receipt-adj-amt-field is-disabled" id="adjAmtField">
            <span class="receipt-adj-sign ${adjType === "deduct" ? "is-deduct" : "is-add"}" id="adjSignIndicator" aria-hidden="true">${adjType === "deduct" ? "\u2212" : "+"}</span>
            <div class="name-box receipt-adj-amt-box is-disabled">
              <input type="text" inputmode="decimal" enterkeyhint="done" id="adjAmountInput" maxlength="7" placeholder="0,00" autocomplete="off" translate="no" spellcheck="false" aria-label="Importo in euro" disabled readonly tabindex="-1" aria-disabled="true">
              <button type="button" class="name-no" id="adjAmountNo" aria-label="Annulla" title="Annulla">${SVG_X}</button>
              <button type="button" class="name-ok" id="adjAmountOk" aria-label="Conferma importo" title="Conferma importo">${SVG_CHK}</button>
            </div>
            <span class="receipt-adj-eur">\u20AC</span>
          </div>
          <button type="button" class="btn btn-primary btn-small receipt-adj-submit ${adjType === "deduct" ? "is-deduct" : "is-add"}" id="addAdjBtn" disabled>${adjType === "deduct" ? "\u2212 Detrai" : "+ Aggiungi"}</button>
        </div>
        <div class="receipt-adj-records" id="receiptAdjRecords"${adjCardRowsHtml ? "" : " hidden"}>${adjCardRowsHtml}</div>
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
    {
      label: "Elimina",
      class: "btn-danger",
      action: async () => {
        const yes = await confirmDialog(
          "Elimina scontrino",
          `Lo scontrino di <strong>${esc(resolvedStore.name || "Senza supermercato")}</strong> del ${dt} verr\xE0 eliminato definitivamente.<br>Procedere comunque?`,
          "Elimina",
          { overlay: true, closeButton: false, backdropClose: false }
        );
        if (!yes) return;
        await delOne("archivedReceipts", currentReceipt.id);
        state.currentModal = null;
        state.currentModalKeep = false;
        await openArchiveWindow(archiveOpts);
        showToast("Scontrino eliminato");
      }
    },
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
    hh.insertAdjacentHTML("afterend", `<div class="info-pop" hidden>Prezzi, quantit\xE0, unit\xE0 di vendita e formato degli articoli restano congelati alla data di archiviazione; nome, marca, reparto, supermercato e percorso di spesa si aggiornano automaticamente con il catalogo.<br>Puoi aggiungere AGGIUNTE (es. sacchetti) o DETRAZIONI (es. buoni fedelt\xE0) allo scontrino, modificarne l'importo con la matita o eliminarle scorrendo verso destra.</div>`);
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

  const amtField = $("#adjAmtField");
  const presetSelect = $("#adjPresetSelect");
  const amtInp = $("#adjAmountInput");
  const amtBox = amtInp?.closest(".name-box");
  const addAdjBtn = $("#addAdjBtn");
  const adjRecordsEl = $("#receiptAdjRecords");
  const adjSignEl = $("#adjSignIndicator");

  const closeAllAdjEditors = (releaseKb = false) => {
    if (!adjRecordsEl) return;
    adjRecordsEl.querySelectorAll(".receipt-adj-item-compact.is-editing").forEach((itemEl) => {
      const id = itemEl.dataset.adjRowId;
      const origAdj = adjustments.find((a) => a.id === id);
      const editorEl = itemEl.querySelector(".receipt-adj-inline-edit");
      const inpEl = itemEl.querySelector(".receipt-adj-edit-input");
      if (inpEl && origAdj) inpEl.value = fmtEditableAmt(origAdj.amountMinor);
      if (editorEl) editorEl.hidden = true;
      itemEl.classList.remove("is-editing");
      if (inpEl && document.activeElement === inpEl) inpEl.blur();
    });
    if (releaseKb) releaseModalKeyboard();
  };

  const bindAdjRecordsInteractions = () => {
    if (!adjRecordsEl || adjRecordsEl.hidden) return;
    bindSwipeDelete(adjRecordsEl, "[data-adj-row-id]", async (row) => {
      const adjId = row.dataset.adjRowId;
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
        const alreadySame = curAdjs.some((a) =>
          a.id === removedAdj.id || (a.type === removedAdj.type && norm(a.label) === norm(removedAdj.label))
        );
        if (!alreadySame) {
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

    adjRecordsEl.querySelectorAll("[data-adj-row-id]").forEach((rowEl) => {
      const adjId = rowEl.dataset.adjRowId;
      const adj = adjustments.find((a) => a.id === adjId);
      if (!adj) return;
      const editBtn = rowEl.querySelector("[data-adj-edit-id]");
      const editorEl = rowEl.querySelector(".receipt-adj-inline-edit");
      const editInp = rowEl.querySelector(".receipt-adj-edit-input");
      const cancelBtn = rowEl.querySelector("[data-adj-edit-cancel]");
      const saveBtn = rowEl.querySelector("[data-adj-edit-save]");

      rowEl.addEventListener("swipestart", () => {
        if (rowEl.classList.contains("is-editing")) closeAllAdjEditors(true);
      });
      editorEl?.addEventListener("pointerdown", (e) => e.stopPropagation());

      const openEditor = () => {
        const alreadyOpen = rowEl.classList.contains("is-editing");
        closeAllAdjEditors(false);
        if (alreadyOpen) {
          releaseModalKeyboard();
          return;
        }
        if (!editorEl || !editInp) return;
        editInp.value = fmtEditableAmt(adj.amountMinor);
        editorEl.hidden = false;
        rowEl.classList.add("is-editing");
        editInp.focus();
        try { editInp.select(); } catch (_) {}
      };

      const saveEditedAmount = async () => {
        if (!editInp) return;
        const raw = editInp.value.trim();
        const nextMinor = eurosFromInput(raw);
        if (nextMinor === null || Number.isNaN(nextMinor) || nextMinor <= 0 || nextMinor > 999999) {
          showToast("Inserisci un importo valido maggiore di zero (max 9999,99 \u20AC).");
          editInp.focus();
          return;
        }
        const prevMinor = Math.max(0, Number(adj.amountMinor) || 0);
        if (nextMinor === prevMinor) {
          closeAllAdjEditors(true);
          return;
        }
        const nextAdjustments = adjustments.map((a) =>
          a.id === adjId ? { ...a, amountMinor: nextMinor, updatedAt: now() } : a
        );
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
        showToast("Importo aggiornato");
      };

      editBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor();
      });
      rowEl.querySelector(".receipt-adj-row-main")?.addEventListener("click", (e) => {
        if (e.target.closest("[data-adj-edit-id]")) return;
        openEditor();
      });
      if (editInp) {
        selectAllOnFocus(editInp);
        editInp.addEventListener("input", () => {
          const clean = sanitizeReceiptAmountInput(editInp.value);
          if (editInp.value !== clean) editInp.value = clean;
        });
        editInp.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault();
            saveEditedAmount();
          } else if (e.key === "Escape") {
            e.preventDefault();
            closeAllAdjEditors(true);
          }
        });
      }
      cancelBtn?.addEventListener("mousedown", (e) => e.preventDefault());
      cancelBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllAdjEditors(true);
      });
      saveBtn?.addEventListener("mousedown", (e) => e.preventDefault());
      saveBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        saveEditedAmount();
      });
    });
  };
  bindAdjRecordsInteractions();

  let confirmedAmtVal = "";
  const syncAmtDirty = () => {
    if (!amtInp || !amtBox) return;
    amtBox.classList.toggle("dirty", !amtInp.disabled && amtInp.value !== confirmedAmtVal);
  };
  const syncAdjAmountEnabled = (clearValue = false) => {
    const enabled = !!selectedPreset;
    if (addAdjBtn) addAdjBtn.disabled = !enabled;
    amtField?.classList.toggle("is-disabled", !enabled);
    presetSelect?.classList.toggle("has-value", enabled);
    if (!amtInp) return;
    amtInp.disabled = !enabled;
    amtInp.readOnly = !enabled;
    amtInp.tabIndex = enabled ? 0 : -1;
    amtInp.setAttribute("aria-disabled", enabled ? "false" : "true");
    amtBox?.classList.toggle("is-disabled", !enabled);
    if (!enabled) {
      if (clearValue) {
        amtInp.value = "";
        confirmedAmtVal = "";
      }
      if (document.activeElement === amtInp) {
        amtInp.blur();
        releaseModalKeyboard();
      }
    }
    syncAmtDirty();
  };

  presetSelect?.addEventListener("change", () => {
    const opt = presetSelect.selectedOptions?.[0];
    if (opt?.disabled) {
      presetSelect.value = "";
      selectedPreset = "";
      syncAdjAmountEnabled(true);
      return;
    }
    selectedPreset = (presetSelect.value || "").trim();
    syncAdjAmountEnabled(!selectedPreset);
    if (selectedPreset) amtInp?.focus();
  });
  syncAdjAmountEnabled(false);

  const tabsWrap = $("#receiptTabsWrap");
  const switchAdjTab = (nextType) => {
    const normalized = nextType === "deduct" ? "deduct" : "add";
    if (normalized === adjType) return;
    adjType = normalized;
    selectedPreset = "";
    syncAdjAmountEnabled(true);
    tabsWrap?.classList.toggle("is-add", adjType === "add");
    tabsWrap?.classList.toggle("is-deduct", adjType === "deduct");
    if (adjSignEl) {
      adjSignEl.textContent = adjType === "deduct" ? "\u2212" : "+";
      adjSignEl.classList.toggle("is-add", adjType === "add");
      adjSignEl.classList.toggle("is-deduct", adjType === "deduct");
    }
    if (addAdjBtn) {
      addAdjBtn.textContent = adjType === "deduct" ? "\u2212 Detrai" : "+ Aggiungi";
      addAdjBtn.classList.toggle("is-add", adjType === "add");
      addAdjBtn.classList.toggle("is-deduct", adjType === "deduct");
    }
    root.querySelectorAll("[data-adj-type]").forEach((b) => {
      const isAct = b.dataset.adjType === adjType;
      b.classList.toggle("active", isAct);
      b.setAttribute("aria-selected", String(isAct));
    });
    if (presetSelect) {
      presetSelect.innerHTML = renderPresetOptionsHtml(adjType);
      presetSelect.value = "";
      presetSelect.setAttribute("aria-label", adjType === "deduct" ? "Detrai voce" : "Aggiungi voce");
      presetSelect.classList.remove("has-value");
    }
  };

  root.querySelectorAll("[data-adj-type]").forEach((btn) => {
    btn.addEventListener("click", () => switchAdjTab(btn.dataset.adjType));
  });

  if (amtInp && amtBox) {
    selectAllOnFocus(amtInp);
    amtInp.addEventListener("focus", () => {
      if (amtInp.disabled) amtInp.blur();
    });
    amtInp.addEventListener("input", () => {
      if (amtInp.disabled) return;
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
    if (addAdjBtn?.disabled) return;
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
    const alreadyExists = adjustments.some((a) => a.type === adjType && norm(a.label) === normLabel);
    if (alreadyExists) {
      showToast("Voce gi\xE0 inserita: usa la matita nell'elenco per modificarla.");
      return;
    }
    const newAdj = {
      id: uuid(),
      type: adjType,
      label,
      amountMinor,
      createdAt: now()
    };
    const nextAdjustments = [...adjustments, newAdj];
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
    showToast(adjType === "add" ? "Aggiunta salvata" : "Detrazione salvata");
  };

  $("#addAdjBtn")?.addEventListener("click", commitAdjustment);
}
