// Router principale, inizializzazione app e blocco orientamento verticale
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { state } from "./state.js";
import { APP_VERSION, CART_CELEBRATION_DATA_URI, DB_VERSION } from "./data.js";
import { $, esc } from "./calculations.js";
import { activeList, getOne, openDB, putOne } from "./storage.js";
import { bindToastSwipe, confirmDialog, handleAppBack, isInstalledPwa, setPage, updateScrollTopButton, updateStickyHeaderOffset } from "./ui.js";
import { openAddItem } from "./shoppingList.js";
import { exportBackup, importBackup } from "./history.js";
import { render } from "./router.js";

export { render };

export async function init() {
  const preloadCartImg = new Image();
  preloadCartImg.onerror = () => {
    if (state.CART_CELEBRATION_IMG === "./CarrelloSpesa.webp") {
      state.CART_CELEBRATION_IMG = "./public/CarrelloSpesa.webp";
      preloadCartImg.src = state.CART_CELEBRATION_IMG;
    } else if (CART_CELEBRATION_DATA_URI) {
      state.CART_CELEBRATION_IMG = CART_CELEBRATION_DATA_URI;
    }
  };
  preloadCartImg.src = state.CART_CELEBRATION_IMG;
  try {
    state.db = await openDB();
    await activeList();
    if (!await getOne("settings", "main")) await putOne("settings", { id: "main", defaultStoreId: null, currency: "EUR" });
    await putOne("meta", { key: "schemaVersion", value: DB_VERSION });
  } catch (e) {
    $("#appMain").innerHTML = `<div class="empty"><strong>Impossibile aprire l'archivio locale.</strong><br>${esc(e.message)}<br>Prova ad aprire l'app con un browser aggiornato.</div>`;
    return;
  }
  try {
    const savedFilters = localStorage.getItem("spesaSuMisura.selectedStores");
    if (savedFilters) {
      try {
        state.selectedStores = JSON.parse(savedFilters);
      } catch (e) {
        state.selectedStores = ["all"];
      }
    } else {
      const oldFilter = localStorage.getItem("spesaSuMisura.selectedStore");
      state.selectedStores = oldFilter && oldFilter !== "all" ? [oldFilter] : ["all"];
    }
  } catch (_) {
    state.selectedStores = ["all"];
  }
  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => {
    state.productsView.q = "";
    state.productsView.cat = "all";
    state.productsView.store = "all";
    state.catsSearchQuery = "";
    state.storesSelectedFilter = "all";
    setPage(b.dataset.page);
  }));
  $("#saveBackupBtn").addEventListener("click", () => exportBackup());
  $("#infoHeaderBtn").addEventListener("click", () => setPage("other"));
  let exitFallbackTimer = null;
  let exitOverlayHiddenWhileBg = false;
  const hideExitOverlay = () => {
    const ov = $("#appExitOverlay");
    if (ov) {
      ov.classList.remove("active");
      ov.setAttribute("aria-hidden", "true");
    }
    exitOverlayHiddenWhileBg = false;
  };
  const attemptExitApp = () => {
    if (Capacitor.isNativePlatform()) {
      App.exitApp();
      return;
    }
    const inPwa = isInstalledPwa();
    clearTimeout(exitFallbackTimer);
    let closedOrHidden = false;
    const cancelFallback = () => {
      closedOrHidden = true;
      clearTimeout(exitFallbackTimer);
      window.removeEventListener("pagehide", cancelFallback);
      document.removeEventListener("visibilitychange", onExitVis);
    };
    const onExitVis = () => {
      if (document.hidden) cancelFallback();
    };
    window.addEventListener("pagehide", cancelFallback, { once: true });
    document.addEventListener("visibilitychange", onExitVis);
    try { navigator.app?.exitApp?.(); } catch (_) {}
    try { window.Capacitor?.Plugins?.App?.exitApp?.(); } catch (_) {}
    try { window.close(); } catch (_) {}
    if (!inPwa) {
      try { window.open("", "_self")?.close?.(); } catch (_) {}
    }
    exitFallbackTimer = setTimeout(() => {
      window.removeEventListener("pagehide", cancelFallback);
      document.removeEventListener("visibilitychange", onExitVis);
      if (closedOrHidden || window.closed || document.hidden) return;
      const ov = $("#appExitOverlay");
      if (ov) {
        const desc = ov.querySelector(".orientation-lock-desc");
        if (desc) {
          desc.textContent = inPwa
            ? "Il sistema operativo del telefono non permette la chiusura automatica delle app web. Scorri dal basso o usa il tasto Home per tornare alla schermata del telefono."
            : "Hai chiuso SpesaSuMisura. Ora puoi chiudere questa scheda del browser.";
        }
        ov.classList.add("active");
        ov.setAttribute("aria-hidden", "false");
      }
    }, 350);
  };
  document.addEventListener("visibilitychange", () => {
    const ov = $("#appExitOverlay");
    if (!ov || !ov.classList.contains("active")) return;
    if (document.hidden) exitOverlayHiddenWhileBg = true;
    else if (exitOverlayHiddenWhileBg) hideExitOverlay();
  });
  $("#exitAppBtn")?.addEventListener("click", async () => {
    const exitBody = `<div class="exit-confirm-body"><div class="exit-confirm-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div><h2 class="exit-confirm-title">Uscire dall'app?</h2><p class="exit-confirm-desc">Vuoi chiudere SpesaSuMisura?</p></div>`;
    await confirmDialog("", exitBody, "Esci", {
      cancelFirst: true,
      closeButton: false,
      backdropClose: false,
      center: true,
      rawBody: true,
      onConfirm: attemptExitApp
    });
  });
  $("#reopenAppBtn")?.addEventListener("click", hideExitOverlay);
  bindToastSwipe();
  function scrollDropdownToSelected(menu) {
    const go = () => {
      const sel = menu.querySelector(".selected");
      if (!sel) return;
      const sw = menu.querySelector(".dd-search-wrap");
      menu.scrollTop = Math.max(0, sel.getBoundingClientRect().top - menu.getBoundingClientRect().top + menu.scrollTop - (sw ? sw.offsetHeight : 0) - 4);
    };
    go();
    setTimeout(go, 60);
    setTimeout(go, 200);
  }
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target;
      if (el.classList && el.classList.contains("custom-dropdown-menu") && !el.hidden) scrollDropdownToSelected(el);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["hidden"], subtree: true });
  document.addEventListener("selectstart", (e) => {
    const el = e.target && e.target.nodeType === 1 ? e.target : e.target?.parentElement;
    if (el?.closest?.(".list-row, .choice-row, .route-row, .other-opt, .pick-opt, .list-action-card")) e.preventDefault();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-dropdown")) {
      document.querySelectorAll(".custom-dropdown-menu").forEach((m) => { m.hidden = true; m.classList.remove("drop-up"); });
      document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
    if (!e.target.closest(".store-filter-wrap")) {
      document.querySelectorAll(".store-filter-menu").forEach((m) => { m.hidden = true; });
      document.querySelectorAll(".store-filter-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
    const b = e.target.closest(".info-btn"), scope = b ? b.closest(".modal") || $("#appMain") : null;
    const tb = e.target.closest(".tip-btn"), tipTarget = tb ? document.getElementById(tb.dataset.tipTarget) : null;
    document.querySelectorAll(".info-pop").forEach((pp) => {
      if (pp.classList.contains("tip-pop")) {
        if (tb && pp === tipTarget) {
          pp.hidden = !pp.hidden;
          if (!pp.hidden) {
            const popRect = pp.getBoundingClientRect(), btnRect = tb.getBoundingClientRect();
            const arrowLeft = Math.max(12, Math.min(popRect.width - 24, (btnRect.left + btnRect.width / 2) - popRect.left - 6));
            pp.style.setProperty("--info-arrow-left", `${arrowLeft}px`);
          }
        } else if (!pp.contains(e.target)) pp.hidden = true;
        return;
      }
      if (b && scope.contains(pp)) {
        pp.hidden = !pp.hidden;
        if (!pp.hidden) {
          const popRect = pp.getBoundingClientRect(), btnRect = b.getBoundingClientRect();
          const arrowLeft = Math.max(12, Math.min(popRect.width - 24, (btnRect.left + btnRect.width / 2) - popRect.left - 6));
          pp.style.setProperty("--info-arrow-left", `${arrowLeft}px`);
        }
      } else if (!pp.contains(e.target)) pp.hidden = true;
    });
  });
  const globalInput = document.createElement("input");
  globalInput.type = "file";
  globalInput.accept = "application/json,.json";
  globalInput.className = "hidden";
  globalInput.id = "globalBackupFile";
  document.body.appendChild(globalInput);
  $("#openBackupBtn").addEventListener("click", () => globalInput.click());
  globalInput.addEventListener("change", (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = "";
  });
  {
    const topBtn = $("#productsTopBtn");
    let lastTopTap = 0;
    const goTopNow = (e) => {
      const nowTs = Date.now();
      if (nowTs - lastTopTap < 350) return;
      lastTopTap = nowTs;
      if (e && e.cancelable) e.preventDefault();
      e?.stopPropagation?.();
      clearTimeout(state.topBtnTimer);
      topBtn.classList.remove("visible");
      const modalEl = $("#modalRoot .modal");
      const target = modalEl ? (modalEl.querySelector(".modal-scroll-body") || modalEl) : window;
      if (target === window) {
        const curY = window.scrollY;
        window.scrollTo({ top: curY, behavior: "auto" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const curT = target.scrollTop;
        target.scrollTo({ top: curT, behavior: "auto" });
        target.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    topBtn.addEventListener("touchstart", goTopNow, { passive: false });
    topBtn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      goTopNow(e);
    }, { passive: false });
    topBtn.addEventListener("click", goTopNow);
  }
  $("#floatingAddItemBtn")?.addEventListener("click", () => openAddItem());
  window.addEventListener("scroll", updateScrollTopButton, { passive: true });
  updateStickyHeaderOffset();
  window.addEventListener("resize", updateStickyHeaderOffset);
  handleAppBack();
  const bt = $("#brandTitle");
  if (bt) bt.innerHTML = `SpesaSuMisura <span class="small muted">v. ${APP_VERSION}</span>`;
  try {
    await render();
  } catch (e) {
    console.error("Errore durante il rendering iniziale:", e);
    const mainEl = $("#appMain");
    if (mainEl) {
      mainEl.innerHTML = `<div class="empty"><strong>Impossibile avviare l'interfaccia.</strong><br>${esc(e?.message || String(e))}</div>`;
    }
  }
}

export function setupPortraitLock() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      screen.orientation.lock("portrait").catch(() => {});
    }
  } catch (_) {}
  const overlay = $("#orientationLockOverlay");
  if (!overlay) return;
  const checkOrientation = () => {
    const isCoarse = window.matchMedia?.("(pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
    const smallDevice = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight) <= 650;
    const oType = window.screen?.orientation?.type || "";
    const physicalLandscape = oType
      ? oType.startsWith("landscape")
      : (typeof window.orientation === "number"
        ? Math.abs(window.orientation) === 90
        : (window.innerWidth > window.innerHeight && !document.activeElement?.matches("input,textarea,select")));
    const shouldLock = isCoarse && smallDevice && physicalLandscape && window.innerWidth > window.innerHeight;
    if (shouldLock && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    overlay.classList.toggle("active", shouldLock);
    overlay.setAttribute("aria-hidden", String(!shouldLock));
    document.body.classList.toggle("orientation-locked", shouldLock);
  };
  checkOrientation();
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  screen.orientation?.addEventListener?.("change", checkOrientation);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      try { screen.orientation?.lock?.("portrait")?.catch?.(() => {}); } catch (_) {}
      checkOrientation();
    }
  });
}

export function initApp() {
  setupPortraitLock();
  return init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
  }, { once: true });
} else {
  initApp();
}
