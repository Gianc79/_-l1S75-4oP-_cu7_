// Persistenza IndexedDB e operazioni di lettura/scrittura sui dati
import { state } from "./state.js";
import { DB_NAME, DB_VERSION, stores } from "./data.js";
import { now, uuid } from "./calculations.js";
import { showToast } from "./ui.js";
import { renderList } from "./shoppingList.js";
import { renderStores } from "./stores.js";

export function requestPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error("Transazione annullata"));
  });
}

export async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      const create = (name, opts, indices = []) => {
        if (d.objectStoreNames.contains(name)) return;
        const s = d.createObjectStore(name, opts);
        for (const [n, k, o] of indices) s.createIndex(n, k, o || {});
        return s;
      };
      create("categories", { keyPath: "id" }, [["nameNormalized", "nameNormalized", { unique: true }]]);
      create("products", { keyPath: "id" }, [["categoryId", "categoryId"], ["nameNormalized", "nameNormalized"]]);
      create("stores", { keyPath: "id" }, [["nameNormalized", "nameNormalized", { unique: true }]]);
      create("storeCategoryRoutes", { keyPath: "id" }, [["storeCategory", ["storeId", "categoryId"], { unique: true }], ["storePosition", ["storeId", "position"], { unique: true }], ["categoryId", "categoryId"]]);
      create("productStores", { keyPath: "id" }, [["productStore", ["productId", "storeId"], { unique: true }], ["storeId", "storeId"]]);
      create("productPrices", { keyPath: "id" }, [["productStore", ["productId", "storeId"], { unique: true }], ["storeId", "storeId"]]);
      create("shoppingLists", { keyPath: "id" }, [["status", "status"]]);
      create("shoppingListItems", { keyPath: "id" }, [["listId", "listId"], ["productId", "productId"], ["storeId", "storeId"], ["listStore", ["listId", "storeId"]], ["listChecked", ["listId", "checked"]]]);
      create("settings", { keyPath: "id" });
      create("tombstones", { keyPath: "id" }, [["entity", ["entityType", "entityId"], { unique: true }], ["revision", "revision"], ["deletedAt", "deletedAt"]]);
      create("meta", { keyPath: "key" });
      create("savedLists", { keyPath: "id" });
      create("archivedReceipts", { keyPath: "id" }, [
        ["archivedAt", "archivedAt"],
        ["purchaseDate", "purchaseDate"],
        ["storeId", "storeId"],
        ["storeDate", ["storeId", "purchaseDate"]]
      ]);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getAll(name) {
  return requestPromise(state.db.transaction(name, "readonly").objectStore(name).getAll());
}

export function getOne(name, key) {
  return requestPromise(state.db.transaction(name, "readonly").objectStore(name).get(key));
}

export async function putOne(name, obj) {
  const tx = state.db.transaction(name, "readwrite");
  tx.objectStore(name).put(obj);
  await txDone(tx);
  return obj;
}

export async function delOne(name, key) {
  const tx = state.db.transaction(name, "readwrite");
  tx.objectStore(name).delete(key);
  await txDone(tx);
}

export async function activeList() {
  let lists = await getAll("shoppingLists");
  let l = lists.find((x) => x.status === "active");
  if (!l) {
    l = { id: uuid(), name: "La mia lista", status: "active", createdAt: now(), updatedAt: now() };
    await putOne("shoppingLists", l);
  }
  return l;
}

export async function settings() {
  return await getOne("settings", "main") || { id: "main", defaultStoreId: null, currency: "EUR" };
}

export async function allData() {
  const out = {};
  for (const s of stores) out[s] = await getAll(s);
  return out;
}

export async function allProductsSorted() {
  return (await getAll("products")).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

export async function allCategoriesSorted() {
  return (await getAll("categories")).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

export async function allStoresSorted() {
  return (await getAll("stores")).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

export async function categoryMap() {
  return Object.fromEntries((await getAll("categories")).map((x) => [x.id, x]));
}

export async function storeMap() {
  return Object.fromEntries((await getAll("stores")).map((x) => [x.id, x]));
}

export async function productMap() {
  return Object.fromEntries((await getAll("products")).map((x) => [x.id, x]));
}

export async function activeItems() {
  const l = await activeList();
  return (await getAll("shoppingListItems")).filter((i) => i.listId === l.id);
}

export async function priceFor(productId, storeId) {
  if (!storeId) return null;
  const a = await getAll("productPrices");
  return a.find((p) => p.productId === productId && p.storeId === storeId) || null;
}

export async function storeIdsForProduct(productId) {
  return (await getAll("productStores")).filter((x) => x.productId === productId).map((x) => x.storeId);
}

export async function resolveStoreForProduct(productId) {
  const st = await settings(), ids = await storeIdsForProduct(productId);
  if (st.defaultStoreId) return st.defaultStoreId;
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) return "choose";
  return null;
}

export async function setDefaultStore(id) {
  const cur = await settings();
  if (cur.defaultStoreId === id) return;
  await putOne("settings", { ...cur, defaultStoreId: id });
  const rows = document.querySelectorAll("#storesListContainer [data-delete-store]");
  if (rows.length) {
    rows.forEach((el) => {
      const isDef = el.dataset.deleteStore === id;
      el.classList.toggle("is-default", isDef);
      const oldBadge = el.querySelector(".badge-default");
      const subRow = el.querySelector(".store-sub-row") || el;
      if (isDef && !oldBadge) subRow.insertAdjacentHTML("beforeend", '<span class="badge-inuse badge-default">PREDEFINITO</span>');
      else if (!isDef && oldBadge) oldBadge.remove();
    });
  } else {
    await renderStores();
  }
  showToast("Nuovo supermercato predefinito");
}

export async function snapshotItems() {
  return (await activeItems()).map((x) => ({ ...x }));
}

export async function replaceItems(newItems) {
  const cur = await activeItems(), tx = state.db.transaction("shoppingListItems", "readwrite"), os = tx.objectStore("shoppingListItems");
  for (const i of cur) os.delete(i.id);
  for (const i of newItems) os.put(i);
  await txDone(tx);
  state.celebrationShownFor = "";
  await renderList();
}

export async function visibleListItems() {
  const items = await activeItems(), allIds = (await allStoresSorted()).map((x) => x.id).concat(["none"]), showAll = state.selectedStores.includes("all") || state.selectedStores.length === allIds.length && allIds.every((id) => state.selectedStores.includes(id));
  return items.filter((i) => showAll ? true : state.selectedStores.includes(i.storeId || "none"));
}
