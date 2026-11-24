// Calcoli, formattazione importi/quantità, unità di misura, ricerca e colori
import { PROD_CONFEZIONE_UNITS, PROD_LENGTH_UNITS, PROD_SFUSO_UNITS, PROD_VOLUME_UNITS, PROD_WEIGHT_UNITS } from "./data.js";

export const $ = (s) => document.querySelector(s);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function normHex6(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

export function autoTextColor(bgHex) {
  const h = normHex6(bgHex);
  if (!h) return "#000000";
  const n = parseInt(h.slice(1), 16);
  const toLin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
  return lum > 0.179 ? "#000000" : "#FFFFFF";
}

export function isLightHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return true;
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 155;
}

export function storeHasColors(s) {
  return !!(s && (s.bgColor || s.textColor));
}

export function storeChipHtml(s, opts = {}) {
  const label = opts.text !== undefined ? opts.text : (s?.name ?? opts.fallback ?? "");
  if (!s || !storeHasColors(s)) {
    if (opts.defaultBold) return `<span class="store-chip-plain" style="font-weight:700">${esc(label)}</span>`;
    return esc(label);
  }
  const bg = s.bgColor || "#eef3f6";
  const fg = s.textColor || autoTextColor(bg);
  const cls = opts.className ? `store-chip ${opts.className}` : "store-chip";
  return `<span class="${cls}" style="background-color:${esc(bg)};color:${esc(fg)}">${esc(label)}</span>`;
}

export function fitStoreChipLabels(root = document) {
  if (!root) return;
  const targets = root.querySelectorAll(".product-editor .store-price-row .store-chip, .product-editor .store-price-row .store-chip-plain, .assign-store-field .store-chip, .assign-store-field .dd-opt-name");
  targets.forEach((el) => {
    if (!el.offsetParent && getComputedStyle(el).display === "none") return;
    el.style.fontSize = "";
    const baseSize = parseFloat(getComputedStyle(el).fontSize) || 14.5;
    let fs = baseSize;
    el.style.fontSize = fs + "px";
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && fs > 10.5) {
      fs -= 0.5;
      el.style.fontSize = fs + "px";
    }
  });
}

export const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const now = () => (/* @__PURE__ */ new Date()).toISOString();

export const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");

export const searchNorm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");

export function searchRank(label, rawQuery) {
  const q = searchNorm(rawQuery);
  if (!q) return 0;
  const t = searchNorm(label);
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s\-/'().,]+/).some((w) => w.startsWith(q))) return 1;
  if (t.includes(q)) return 2;
  return -1;
}

export function filterBySearch(list, rawQuery, getLabel) {
  const q = searchNorm(rawQuery);
  if (!q) return list;
  const ranked = [];
  for (let i = 0; i < list.length; i++) {
    const r = searchRank(getLabel(list[i]), q);
    if (r >= 0) ranked.push({ item: list[i], r, i });
  }
  ranked.sort((a, b) => (a.r - b.r) || (a.i - b.i));
  return ranked.map((x) => x.item);
}

export function applyDropdownSearch(container, rows, rawQuery, getLabel, opts = {}) {
  const q = searchNorm(rawQuery);
  const keepLast = opts.keepLast;
  const anchor = opts.insertBefore || null;
  let vis = 0;
  const items = rows.map((row, idx) => {
    if (row.dataset.origIdx === undefined) row.dataset.origIdx = String(idx);
    const origIdx = Number(row.dataset.origIdx);
    const pinnedLast = !!(keepLast && keepLast(row));
    const rank = pinnedLast ? 99 : searchRank(getLabel(row), q);
    const hide = !!q && !pinnedLast && rank < 0;
    row.hidden = hide;
    if (!hide && !pinnedLast) vis++;
    return { row, rank: q ? rank : 0, origIdx, pinnedLast };
  });
  items.sort((a, b) => (a.pinnedLast - b.pinnedLast) || (a.rank - b.rank) || (a.origIdx - b.origIdx));
  items.forEach(({ row }) => container.insertBefore(row, anchor));
  return vis;
}

export const money = (cents) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);

export const assignUnit = (u) => u === "pz." ? "pz" : u;

export const moneyPerUnit = (cents, unit) => `${((cents || 0) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20AC/${assignUnit(unit)}`;

export const numFmt = (n) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(n);

export const parseQty = (s) => {
  let x = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!x || !Number.isFinite(Number(x))) return NaN;
  return Number(x);
};

export function catOptionsFor(storeId, catList, routes) {
  let list = catList;
  if (storeId && storeId !== "__none__") {
    const ids = new Set(routes.filter((r) => r.storeId === storeId).map((r) => r.categoryId));
    list = catList.filter((c) => ids.has(c.id));
  }
  return [{ id: "", name: "Tutti i reparti" }, { id: "__none__", name: "Senza reparto" }].concat(list.map((c) => ({ id: c.id, name: c.name })));
}

export function productInStore(p, assoc, sid) {
  if (!sid) return true;
  if (sid === "__none__") return !assoc.some((a) => a.productId === p.id);
  return assoc.some((a) => a.productId === p.id && a.storeId === sid);
}

export function canonicalSavedItem(i, pMap, sMap) {
  if (!i || !pMap[i.productId]) return null;
  const sid = i.storeId && sMap[i.storeId] ? i.storeId : null;
  const mup = i.manualUnitPriceMinor !== undefined && i.manualUnitPriceMinor !== null ? Number(i.manualUnitPriceMinor) : null;
  const mam = i.manualAmountMinor !== undefined && i.manualAmountMinor !== null ? Number(i.manualAmountMinor) : null;
  return `${i.productId}|${sid || ""}|${Number(i.quantity)}|${mup ?? ""}|${mam ?? ""}`;
}

export function eurosFromInput(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\u20AC|€/g, "").trim();
  if (s === "") return null;
  let n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function qtyValid(q, unit) {
  return Number.isFinite(q) && q > 0 && q <= 999999 && (unit === "pz" || unit === "pz." ? Number.isInteger(q) : Math.round(q * 1e3) === q * 1e3);
}

export function fmtQtyUnit(q, u) {
  const n = Number(q);
  if (u === "pz" || u === "pz.") return String(Math.round(n));
  const d = u === "kg" ? 3 : 1;
  return n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatQty(q, u) {
  return u ? fmtQtyUnit(q, u) : numFmt(q);
}

export function quantityStepValue(q, unit, dir) {
  if (unit === "pz" || unit === "pz.") return dir > 0 ? Math.max(1, Math.floor(q + 1e-8) + 1) : Math.max(1, Math.ceil(q - 1e-8) - 1);
  const k = unit === "lt" ? 2 : 10, sc = q * k, n = dir > 0 ? Math.floor(sc + 1e-8) + 1 : Math.ceil(sc - 1e-8) - 1;
  return Math.max(1 / k, Math.round(n) / k);
}

export function isWeightPackUnit(u) {
  return PROD_WEIGHT_UNITS.includes(u);
}

export function isVolumePackUnit(u) {
  return PROD_VOLUME_UNITS.includes(u);
}

export function isLengthPackUnit(u) {
  return PROD_LENGTH_UNITS.includes(u);
}

export function isPiecePackUnit(u) {
  return u === "pz";
}

export function salesUnitForPackaging(packaging, packUnit = "kg") {
  if (packaging !== "sfuso") return "pz";
  if (isPiecePackUnit(packUnit)) return "pz";
  if (isVolumePackUnit(packUnit)) return "lt";
  if (isLengthPackUnit(packUnit)) return "m";
  return "kg";
}

export function storesDescFor(packaging, packUnit = "kg") {
  if (packaging !== "sfuso") return "Attiva i supermercati e inserisci il prezzo per confezione (\u20AC/pz).";
  if (isPiecePackUnit(packUnit)) return "Attiva i supermercati e inserisci il prezzo (\u20AC/pz).";
  if (isVolumePackUnit(packUnit)) return "Attiva i supermercati e inserisci il prezzo (\u20AC/lt).";
  if (isLengthPackUnit(packUnit)) return "Attiva i supermercati e inserisci il prezzo (\u20AC/m).";
  return "Attiva i supermercati e inserisci il prezzo (\u20AC/kg).";
}

export function packQtyValid(q, packUnit = "kg") {
  if (!Number.isFinite(q) || q <= 0 || q > 999999) return false;
  if (isPiecePackUnit(packUnit)) return Math.abs(Math.round(q) - q) < 1e-6;
  return Math.abs(Math.round(q * 1e3) - q * 1e3) < 1e-6;
}

export function formatPackQtyValue(q) {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: false });
}

export function composeProductDescription(itemName, brand, packQtyRaw, packUnit, strictFormat = false, packaging = "confezione") {
  const n = String(itemName || "").trim().replace(/\s+/g, " ");
  const b = String(brand || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("it");
  const u = String(packUnit || "").trim();
  let qtyPart = "";
  if (packaging === "sfuso") {
    qtyPart = u ? `@${u}` : "";
  } else {
    const rawQ = String(packQtyRaw ?? "").trim();
    let qtyText = "";
    if (rawQ) {
      const q = parseQty(rawQ);
      if (strictFormat) {
        qtyText = formatPackQtyValue(q);
      } else if (/[.,]$/.test(rawQ)) {
        qtyText = rawQ.replace(".", ",");
      } else if (Number.isFinite(q) && q > 0) {
        qtyText = formatPackQtyValue(q);
      } else {
        qtyText = rawQ.replace(".", ",");
      }
    }
    qtyPart = qtyText && u ? `${qtyText}${u}` : qtyText;
  }
  return [n, b, qtyPart].filter(Boolean).join(" ");
}

export function formatTitleWithNetHtml(itemNameVal, qtyPart, isSfuso) {
  const n = String(itemNameVal || "").trim().replace(/\s+/g, " ");
  const q = String(qtyPart || "").trim();
  if (!q) return esc(n);
  const qHtml = isSfuso ? `<span class="desc-net-sfuso">${esc(q)}</span>` : esc(q);
  return n ? `${esc(n)} ${qHtml}` : qHtml;
}

export function productDisplayParts(p) {
  if (!p) return { title: "", titleHtml: "", brand: "", isSfuso: false };
  if (p.packaging === "confezione" || p.packaging === "sfuso") {
    const f = extractProductFields(p);
    const isSfuso = f.packaging === "sfuso";
    const qtyPart = composeProductDescription("", "", isSfuso ? 1 : p.packQty, f.packUnit, true, f.packaging);
    const title = [f.itemName, qtyPart].filter(Boolean).join(" ") || String(p.name || "").trim();
    const titleHtml = (f.itemName || qtyPart) ? formatTitleWithNetHtml(f.itemName, qtyPart, isSfuso) : esc(String(p.name || "").trim());
    const brand = String(f.brand || "").trim();
    return { title, titleHtml, brand, isSfuso };
  }
  const rawName = String(p.name || "").trim();
  const brand = String(p.brand || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("it");
  return { title: rawName, titleHtml: esc(rawName), brand, isSfuso: false };
}

export function productSearchText(p) {
  const dp = productDisplayParts(p);
  return dp.brand ? `${dp.title} ${dp.brand}` : dp.title;
}

export function extractProductFields(p) {
  if (!p) {
    return { isLegacy: false, itemName: "", brand: "", packaging: "confezione", packUnit: "kg", packQtyStr: "", legacyName: "" };
  }
  if (p.packaging === "confezione" || p.packaging === "sfuso") {
    const packaging = p.packaging;
    const rawU = p.packUnit === "l" ? "lt" : (p.packUnit === "pz." ? "pz" : p.packUnit);
    const packUnit = packaging === "sfuso"
      ? (PROD_SFUSO_UNITS.includes(rawU) ? rawU : (isVolumePackUnit(rawU) || p.unit === "lt" ? "lt" : (isLengthPackUnit(rawU) || p.unit === "m" ? "m" : (p.unit === "pz" || p.unit === "pz." ? "pz" : "kg"))))
      : (PROD_CONFEZIONE_UNITS.includes(rawU) ? rawU : "kg");
    const packQtyStr = packaging === "sfuso"
      ? (isPiecePackUnit(packUnit) ? "1" : "1,000")
      : (Number.isFinite(Number(p.packQty)) && Number(p.packQty) > 0 ? formatPackQtyValue(Number(p.packQty)) : "");
    return { isLegacy: false, itemName: p.itemName || "", brand: String(p.brand || "").toLocaleUpperCase("it"), packaging, packUnit, packQtyStr, legacyName: "" };
  }
  const packaging = (p.unit === "kg" || p.unit === "lt" || p.unit === "l" || p.unit === "m") ? "sfuso" : "confezione";
  let packUnit = (p.unit === "lt" || p.unit === "l") ? "lt" : (p.unit === "m" ? "m" : "kg");
  let itemName = String(p.name || "").trim();
  let packQtyStr = packaging === "sfuso" ? "1,000" : "";
  const m = /^(.*?)\s+(\d+(?:[.,]\d{1,3})?)\s*(kg|g|lt|l|cl|ml|cm|m|pz\.?)$/i.exec(itemName);
  if (m) {
    const uMatch = m[3].toLowerCase();
    const normU = uMatch === "l" ? "lt" : (uMatch === "pz." ? "pz" : uMatch);
    if (packaging === "confezione" || PROD_SFUSO_UNITS.includes(normU)) {
      const qVal = parseQty(m[2]);
      if (packQtyValid(qVal, normU)) {
        itemName = m[1].trim();
        packUnit = normU;
        if (packaging === "confezione") packQtyStr = formatPackQtyValue(qVal);
        else if (isPiecePackUnit(normU)) packQtyStr = "1";
      }
    }
  }
  return { isLegacy: true, itemName, brand: "", packaging, packUnit, packQtyStr, legacyName: String(p.name || "").trim() };
}

export function packQtyPlaceholderFor(packUnit) {
  if (packUnit === "pz") return "Es. 6";
  if (packUnit === "g" || packUnit === "ml") return "Es. 500";
  if (packUnit === "cl") return "Es. 75";
  if (packUnit === "lt") return "Es. 1,5";
  if (packUnit === "m") return "Es. 25";
  if (packUnit === "cm") return "Es. 30";
  return "Es. 0,5";
}
