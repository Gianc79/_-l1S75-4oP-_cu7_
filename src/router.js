// Router principale per il rendering delle schermate dell'applicazione
import { state } from "./state.js";
import { $ } from "./calculations.js";
import { updateNav, updateScrollTopButton } from "./ui.js";
import { renderList } from "./shoppingList.js";
import { renderOther } from "./history.js";
import { renderProducts } from "./products.js";
import { renderCategories } from "./categories.js";
import { openStoreDetail, renderStores } from "./stores.js";

export async function render() {
  updateNav();
  $("#listFooter").classList.toggle("hidden", state.page !== "list");
  document.querySelector(".header-actions").style.visibility = "visible";
  if (state.page === "list") await renderList();
  else if (state.page === "products") await renderProducts();
  else if (state.page === "stores") await renderStores();
  else if (state.page === "storeDetail") await openStoreDetail(state.manageStoreId);
  else if (state.page === "categories") await renderCategories();
  else await renderOther();
  if (state.pendingScrollTop) {
    state.pendingScrollTop = false;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  const _m = $("#appMain");
  _m.classList.remove("page-in");
  void _m.offsetWidth;
  _m.classList.add("page-in");
  updateScrollTopButton();
}
