// Componenti interfaccia comuni: modali, toast, filtri, dropdown, swipe e navigazione
import { state } from "./state.js";
import { SVG_CHK, SVG_TIP_BULB, SVG_X, SWIPE_TRASH_SVG } from "./data.js";
import { $, applyDropdownSearch, esc, filterBySearch, fitStoreChipLabels, searchNorm, searchRank } from "./calculations.js";
import { render } from "./router.js";

export function tipBtn(targetId, label = "Suggerimento") {
  return `<button type="button" class="tip-btn" data-tip-target="${esc(targetId)}" aria-label="${esc(label)}" title="${esc(label)}">${SVG_TIP_BULB}</button>`;
}

export function infoPop(t) {
  return `<div class="info-pop" id="infoPop" hidden>${t}</div>`;
}

export function selectAllOnFocus(inp) {
  if (!inp || inp.dataset.selectAllBound) return;
  inp.dataset.selectAllBound = "1";
  inp.setAttribute("translate", "no");
  inp.setAttribute("spellcheck", "false");
  let justFocused = false;
  const doSel = () => {
    if (document.activeElement !== inp || !inp.value.length) return;
    if (inp.selectionStart === 0 && inp.selectionEnd === inp.value.length) return;
    try { inp.select(); } catch (_) {}
    try { inp.setSelectionRange(0, inp.value.length); } catch (_) {}
  };
  inp.addEventListener("focus", () => {
    justFocused = true;
    doSel();
    requestAnimationFrame(() => {
      if (document.activeElement === inp && inp.value.length && inp.selectionStart === inp.selectionEnd) doSel();
    });
  });
  inp.addEventListener("contextmenu", (e) => e.preventDefault());
  inp.addEventListener("mouseup", (e) => {
    if (justFocused) {
      justFocused = false;
      e.preventDefault();
    }
  });
  inp.addEventListener("blur", () => { justFocused = false; });
}

export function forceUppercaseInput(inp) {
  if (!inp || inp.dataset.upperBound) return;
  inp.dataset.upperBound = "1";
  inp.setAttribute("autocapitalize", "characters");
  inp.classList.add("force-upper");
  let composing = false;
  const toUpper = () => {
    const start = inp.selectionStart, end = inp.selectionEnd;
    const upper = inp.value.toLocaleUpperCase("it");
    if (inp.value !== upper) {
      inp.value = upper;
      try {
        if (start !== null && end !== null) inp.setSelectionRange(start, end);
      } catch (_) {}
    }
  };
  inp.addEventListener("compositionstart", () => { composing = true; });
  inp.addEventListener("compositionend", () => { composing = false; toUpper(); });
  inp.addEventListener("input", () => { if (!composing) toUpper(); });
}

export function swipeWrap(rowHtml, extraClass = "") {
  return `<div class="swipe-wrap${extraClass ? " " + extraClass : ""}"><div class="swipe-bg" aria-hidden="true"><span class="swipe-bg-icon">${SWIPE_TRASH_SVG}</span><span>Elimina</span></div>${rowHtml}</div>`;
}

export function bindSwipeDelete(root, rowSelector, onDelete) {
  if (!root) return;
  root.querySelectorAll(rowSelector).forEach((row) => {
    const wrap = row.closest(".swipe-wrap");
    if (!wrap) return;
    row.classList.add("swipe-item");
    const bg = wrap.querySelector(".swipe-bg");
    const bgIcon = wrap.querySelector(".swipe-bg-icon");
    row.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest('input[type="checkbox"], [data-drag-handle], .row-edit-inline')) return;
      if (row.dataset.swipeDeleting === "1") return;
      const startX = e.clientX, startY = e.clientY;
      let velX = startX, velT = performance.now();
      let swipeState = "pending", offset = 0;
      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (swipeState === "pending") {
          if ((Math.abs(dy) > 9 && Math.abs(dy) >= Math.abs(dx)) || dx < -10) {
            swipeState = "cancel";
            cleanup();
            return;
          }
          if (dx > 10 && dx > Math.abs(dy) * 1.25) {
            swipeState = "swiping";
            row.dataset.swiping = "1";
            row.dispatchEvent(new CustomEvent("swipestart", { bubbles: true }));
            wrap.classList.add("swiping");
            row.style.transition = "none";
          } else {
            return;
          }
        }
        if (swipeState === "swiping") {
          if (ev.cancelable) ev.preventDefault();
          offset = Math.max(0, dx);
          const nowT = performance.now();
          if (nowT - velT > 45) {
            velX = ev.clientX;
            velT = nowT;
          }
          const w = wrap.offsetWidth || 300;
          const threshold = Math.min(125, Math.max(84, w * 0.34));
          const armed = offset >= threshold;
          row.style.transform = `translate3d(${offset}px, 0, 0)`;
          if (bg) bg.style.opacity = String(Math.min(1, offset / 22));
          if (bgIcon) bgIcon.style.transform = `scale(${armed ? 1.16 : (0.75 + 0.3 * Math.min(1, offset / threshold)).toFixed(2)})`;
          wrap.classList.toggle("swipe-armed", armed);
        }
      };
      const onUp = (ev) => {
        cleanup();
        if (swipeState !== "swiping") return;
        const suppress = (ce) => { ce.preventDefault(); ce.stopPropagation(); };
        row.addEventListener("click", suppress, true);
        setTimeout(() => row.removeEventListener("click", suppress, true), 350);
        delete row.dataset.swiping;
        const dt = Math.max(16, performance.now() - velT);
        const vx = (ev.clientX - velX) / dt;
        const w = wrap.offsetWidth || 300;
        const threshold = Math.min(125, Math.max(84, w * 0.34));
        const shouldDelete = ev.type === "pointerup" && (offset >= threshold || (offset >= 54 && vx > 0.42));
        if (shouldDelete) {
          row.dataset.swipeDeleting = "1";
          row.style.transition = "transform 0.2s cubic-bezier(0.22, 0.8, 0.36, 1), opacity 0.2s ease";
          row.style.transform = `translate3d(${Math.max(w + 28, 360)}px, 0, 0)`;
          row.style.opacity = "0.15";
          setTimeout(() => {
            wrap.style.height = wrap.offsetHeight + "px";
            wrap.style.transition = "height 0.16s ease, margin-bottom 0.16s ease, opacity 0.14s ease";
            void wrap.offsetHeight;
            wrap.style.height = "0px";
            wrap.style.marginBottom = "0px";
            wrap.style.opacity = "0";
            setTimeout(async () => {
              const res = await onDelete(row);
              if (res === false) {
                delete row.dataset.swipeDeleting;
                wrap.classList.remove("swiping", "swipe-armed");
                wrap.style.transition = "";
                wrap.style.height = "";
                wrap.style.marginBottom = "";
                wrap.style.opacity = "";
                if (bg) {
                  bg.style.transition = "";
                  bg.style.opacity = "0";
                }
                if (bgIcon) bgIcon.style.transform = "";
                row.style.transition = "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease";
                row.style.transform = "translate3d(0, 0, 0)";
                row.style.opacity = "";
                setTimeout(() => {
                  row.style.transition = "";
                  row.style.transform = "";
                }, 230);
              }
            }, 165);
          }, 185);
        } else {
          row.style.transition = "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
          row.style.transform = "translate3d(0, 0, 0)";
          if (bg) {
            bg.style.transition = "opacity 0.22s ease";
            bg.style.opacity = "0";
          }
          setTimeout(() => {
            wrap.classList.remove("swiping", "swipe-armed");
            row.style.transition = "";
            row.style.transform = "";
            if (bg) bg.style.transition = "";
            if (bgIcon) bgIcon.style.transform = "";
          }, 250);
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  });
}

export function resetToastSwipeStyle(root) {
  if (!root) return;
  root.style.transition = "";
  root.style.opacity = "";
  root.style.setProperty("--toast-swipe-x", "0px");
  delete root.dataset.swiping;
}

export function bindToastSwipe() {
  const root = $("#toastRoot");
  if (!root || root.dataset.swipeBound) return;
  root.dataset.swipeBound = "1";
  root.addEventListener("touchmove", (e) => {
    if (root.dataset.swiping === "1" && e.cancelable) e.preventDefault();
  }, { passive: false });
  root.addEventListener("pointerdown", (e) => {
    if (root.classList.contains("hidden")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pid = e.pointerId;
    const startX = e.clientX, startY = e.clientY;
    let velX = startX, velT = performance.now();
    let swipeState = "pending", offset = 0;
    const onMove = (ev) => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (swipeState === "pending") {
        if ((Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.4) || dx < -12) {
          swipeState = "cancel";
          cleanup();
          return;
        }
        if (dx > 3 && dx >= Math.abs(dy) * 0.75) {
          swipeState = "swiping";
          root.dataset.swiping = "1";
          clearTimeout(state.toastTimer);
          root.style.transition = "none";
          try { root.setPointerCapture?.(pid); } catch (_) {}
        } else {
          return;
        }
      }
      if (swipeState === "swiping") {
        if (ev.cancelable) ev.preventDefault();
        offset = Math.max(0, dx);
        const nowT = performance.now();
        if (nowT - velT > 16) {
          velX = ev.clientX;
          velT = nowT;
        }
        const w = root.offsetWidth || 260;
        root.style.setProperty("--toast-swipe-x", `${offset}px`);
        root.style.opacity = String(Math.max(0.15, 1 - offset / (w * 0.95)));
      }
    };
    const onUp = (ev) => {
      if (ev.pointerId !== pid) return;
      cleanup();
      try { if (root.hasPointerCapture?.(pid)) root.releasePointerCapture(pid); } catch (_) {}
      if (swipeState !== "swiping") return;
      const suppress = (ce) => { ce.preventDefault(); ce.stopPropagation(); };
      root.addEventListener("click", suppress, true);
      setTimeout(() => root.removeEventListener("click", suppress, true), 300);
      const dt = Math.max(12, performance.now() - velT);
      const vx = (ev.clientX - velX) / dt;
      const w = root.offsetWidth || 260;
      const threshold = Math.min(54, Math.max(24, w * 0.14));
      const shouldDismiss = offset >= threshold || (ev.type === "pointerup" && offset >= 10 && vx > 0.12);
      if (shouldDismiss) {
        clearTimeout(state.undoTimer);
        clearTimeout(state.toastTimer);
        clearTimeout(state.toastDismissTimer);
        const offX = Math.max(w + 120, Math.ceil(window.innerWidth * 0.65 + w * 0.5));
        root.style.transition = "transform 0.13s ease-out, opacity 0.13s ease-out";
        root.style.setProperty("--toast-swipe-x", `${offX}px`);
        root.style.opacity = "0";
        state.toastDismissTimer = setTimeout(() => {
          root.className = "toast hidden";
          root.innerHTML = "";
          resetToastSwipeStyle(root);
        }, 135);
      } else {
        delete root.dataset.swiping;
        root.style.transition = "transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease";
        root.style.setProperty("--toast-swipe-x", "0px");
        root.style.opacity = "";
        state.toastTimer = setTimeout(() => {
          root.className = "toast hidden";
          root.innerHTML = "";
          resetToastSwipeStyle(root);
        }, root.classList.contains("with-undo") ? 3200 : 2200);
        setTimeout(() => {
          if (!root.classList.contains("hidden")) root.style.transition = "";
        }, 170);
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });
}

export function showToast(message, ms = 2600) {
  const root = $("#toastRoot");
  clearTimeout(state.undoTimer);
  clearTimeout(state.toastTimer);
  clearTimeout(state.toastDismissTimer);
  resetToastSwipeStyle(root);
  const strayUndo = document.body.querySelector(":scope > #undoToastBtn");
  if (strayUndo) strayUndo.remove();
  root.textContent = message;
  root.className = "toast";
  state.toastTimer = setTimeout(() => {
    root.className = "toast hidden";
    resetToastSwipeStyle(root);
  }, ms);
}

export function showUndoToast(msg, onUndo) {
  const root = $("#toastRoot");
  clearTimeout(state.undoTimer);
  clearTimeout(state.toastTimer);
  clearTimeout(state.toastDismissTimer);
  resetToastSwipeStyle(root);
  const strayUndo = document.body.querySelector(":scope > #undoToastBtn");
  if (strayUndo) strayUndo.remove();
  root.innerHTML = `<span class="toast-msg">${esc(msg)}</span><button type="button" class="toast-undo-btn" id="undoToastBtn">Annulla</button>`;
  root.className = "toast with-undo";
  const b = $("#undoToastBtn");
  let handled = false;
  let downInfo = null;
  const triggerUndo = () => {
    if (handled) return;
    handled = true;
    clearTimeout(state.undoTimer);
    clearTimeout(state.toastTimer);
    clearTimeout(state.toastDismissTimer);
    root.className = "toast hidden";
    root.innerHTML = "";
    resetToastSwipeStyle(root);
    onUndo();
  };
  b.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    downInfo = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  b.addEventListener("pointerup", (e) => {
    if (!downInfo || e.pointerId !== downInfo.id) return;
    const dist = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
    downInfo = null;
    if (root.dataset.swiping === "1" || dist > 20) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType !== "mouse") {
      installGhostClickShield(e.clientX, e.clientY, 450);
    } else {
      const cx = e.clientX, cy = e.clientY;
      const suppressClick = (ce) => {
        if (Math.hypot((ce.clientX || 0) - cx, (ce.clientY || 0) - cy) < 40) {
          ce.preventDefault();
          ce.stopPropagation();
        }
        document.removeEventListener("click", suppressClick, true);
      };
      document.addEventListener("click", suppressClick, true);
      setTimeout(() => document.removeEventListener("click", suppressClick, true), 120);
    }
    triggerUndo();
  });
  b.addEventListener("pointercancel", () => { downInfo = null; });
  b.addEventListener("click", (e) => {
    if (root.dataset.swiping === "1") return;
    e.preventDefault();
    e.stopPropagation();
    triggerUndo();
  });
  state.toastTimer = setTimeout(() => {
    if (handled) return;
    root.className = "toast hidden";
    root.innerHTML = "";
    resetToastSwipeStyle(root);
  }, 4e3);
}

export function closeModal(runOnClose = true) {
  if (state.activeConfirmOverlayDismiss) {
    const dismissOverlay = state.activeConfirmOverlayDismiss;
    state.activeConfirmOverlayDismiss = null;
    dismissOverlay();
    if (runOnClose) return;
  }
  if (state.activeModalViewportCleanup) {
    state.activeModalViewportCleanup();
    state.activeModalViewportCleanup = null;
  }
  const onClose = state.currentModal;
  const keepModal = state.currentModalKeep;
  state.currentModal = null;
  state.currentModalKeep = false;
  if (runOnClose && keepModal && typeof onClose === "function") {
    try {
      Promise.resolve(onClose()).catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
    }
    return;
  }
  clearTimeout(state.activeModalCloseTimer);
  state.activeModalCloseTimer = null;
  const bd = $("#modalBackdrop");
  const finishClose = () => {
    clearTimeout(state.activeModalCloseTimer);
    state.activeModalCloseTimer = null;
    if ($("#modalBackdrop") === bd) $("#modalRoot").innerHTML = "";
    updateScrollTopButton();
    updateFloatingAddButton();
  };
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (bd && !bd.classList.contains("modal-closing") && !reducedMotion) {
    bd.classList.remove("modal-opening", "keyboard-open", "kb-closing", "vv-animating", "sticky-footer-kb");
    bd.classList.add("modal-closing");
    updateScrollTopButton();
    updateFloatingAddButton();
    state.activeModalCloseTimer = setTimeout(finishClose, 285);
  } else {
    $("#modalRoot").innerHTML = "";
    updateScrollTopButton();
    updateFloatingAddButton();
  }
  if (runOnClose && typeof onClose === "function") setTimeout(() => {
    try {
      Promise.resolve(onClose()).catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
    }
  }, 0);
}

export function releaseModalKeyboard() {
  const bd = $("#modalBackdrop");
  if (bd && typeof bd._releaseKeyboard === "function") bd._releaseKeyboard();
  else bd?.classList.remove("keyboard-open", "kb-closing", "vv-animating", "sticky-footer-kb");
}

export function installGhostClickShield(x, y, ms = 500) {
  if (state.ghostClickShieldCleanup) state.ghostClickShieldCleanup();
  const startedAt = performance.now();
  const remove = () => {
    clearTimeout(timer);
    document.removeEventListener("click", onMouseOrClick, true);
    document.removeEventListener("mousedown", onMouseOrClick, true);
    document.removeEventListener("mouseup", onMouseOrClick, true);
    document.removeEventListener("touchstart", onNewTouch, true);
    document.removeEventListener("pointerdown", onNewPointer, true);
    if (state.ghostClickShieldCleanup === remove) state.ghostClickShieldCleanup = null;
  };
  const onNewTouch = () => {
    if (performance.now() - startedAt > 20) remove();
  };
  const onNewPointer = (ev) => {
    if (ev.pointerType !== "mouse" && performance.now() - startedAt > 20) remove();
  };
  const onMouseOrClick = (ev) => {
    const cx = typeof ev.clientX === "number" ? ev.clientX : x;
    const cy = typeof ev.clientY === "number" ? ev.clientY : y;
    if (Math.hypot(cx - x, cy - y) < 64 || (cx === 0 && cy === 0)) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      if (ev.type === "click") remove();
    }
  };
  const timer = setTimeout(remove, ms);
  document.addEventListener("click", onMouseOrClick, true);
  document.addEventListener("mousedown", onMouseOrClick, true);
  document.addEventListener("mouseup", onMouseOrClick, true);
  document.addEventListener("touchstart", onNewTouch, true);
  document.addEventListener("pointerdown", onNewPointer, true);
  state.ghostClickShieldCleanup = remove;
}

export function bindFastTap(el, handler) {
  if (!el || el.dataset.fastTapBound) return;
  el.dataset.fastTapBound = "1";
  let down = null;
  let lastRun = 0;
  let lastTouchTriggerTs = 0;
  const run = (e) => {
    const nowTs = Date.now();
    if (nowTs - lastRun < 300) return;
    lastRun = nowTs;
    handler(e);
  };
  const clearWin = () => {
    window.removeEventListener("pointerup", onWinUp, true);
    window.removeEventListener("pointercancel", onWinCancel, true);
  };
  const onWinUp = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    clearWin();
    if (dist > 24) return;
    lastTouchTriggerTs = Date.now();
    installGhostClickShield(e.clientX, e.clientY, 500);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    run(e);
  };
  const onWinCancel = (e) => {
    if (!down || e.pointerId !== down.id) return;
    down = null;
    clearWin();
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    window.addEventListener("pointerup", onWinUp, true);
    window.addEventListener("pointercancel", onWinCancel, true);
  });
  el.addEventListener("touchend", (e) => {
    if (Date.now() - lastTouchTriggerTs < 120 && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
  el.addEventListener("click", (e) => {
    if (Date.now() - lastTouchTriggerTs < 500) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    run(e);
  });
}

export function modal(title, body, buttons = [], opts = {}) {
  clearTimeout(state.activeModalCloseTimer);
  state.activeModalCloseTimer = null;
  if (state.activeModalViewportCleanup) {
    state.activeModalViewportCleanup();
    state.activeModalViewportCleanup = null;
  }
  state.currentModal = opts.onClose || null;
  state.currentModalKeep = !!opts.keepModalOnClose;
  updateFloatingAddButton();
  const closeButton = opts.closeButton ? `<button class="modal-close" id="modalCloseBtn" type="button" aria-label="Chiudi" title="Chiudi">\xD7</button>` : "";
  const headerHtml = title || opts.closeButton ? `<div class="modal-header">${title ? `<h2>${esc(title)}</h2>` : ""}${closeButton}</div>` : "";
  const isSwitch = !!$("#modalBackdrop");
  const modalClasses = ["modal", isSwitch ? "modal-switch" : "modal-enter"];
  if (opts.themed) modalClasses.push("modal-themed");
  if (opts.headerThemed) modalClasses.push("modal-header-themed");
  if (opts.stickyFooter) modalClasses.push("modal-has-sticky-footer");
  const actionsHtml = buttons.length ? `<div class="modal-actions">${buttons.map((b, i) => `<button type="button" class="btn ${b.class || "btn-secondary"}"${b.id ? ` id="${esc(b.id)}"` : ""}${b.disabled ? " disabled" : ""} data-modal-action="${i}">${esc(b.label)}</button>`).join("")}</div>` : "";
  const bodyHtml = opts.stickyFooter ? `<div class="modal-scroll-body">${body}</div>` : body;
  const footerHtml = opts.stickyFooter ? `<div class="modal-sticky-footer">${opts.stickyFooterHtml || ""}${actionsHtml}</div>` : actionsHtml;
  const sectionHtml = `<section class="${modalClasses.join(" ")}" role="dialog" aria-modal="true" aria-label="${esc(title || "Finestra")}" tabindex="-1">${headerHtml}${bodyHtml}${footerHtml}</section>`;
  const backdropClass = `modal-backdrop${opts.alignTop ? " modal-top" : ""}${opts.center ? " modal-center" : ""}`;
  let backdrop = $("#modalBackdrop");
  if (backdrop) {
    backdrop.className = backdropClass;
    backdrop.innerHTML = sectionHtml;
  } else {
    $("#modalRoot").innerHTML = `<div class="${backdropClass} modal-opening" id="modalBackdrop">${sectionHtml}</div>`;
    backdrop = $("#modalBackdrop");
    backdrop.addEventListener("animationend", () => backdrop.classList.remove("modal-opening"), { once: true });
  }
  const modalEl = backdrop.querySelector(".modal");
  if (modalEl) {
    modalEl.addEventListener("animationend", () => {
      modalEl.classList.remove("modal-enter", "modal-switch");
    }, { once: true });
  }
  const closeBtnEl = $("#modalCloseBtn");
  if (closeBtnEl) {
    bindFastTap(closeBtnEl, () => {
      if (opts.keepModalOnClose && opts.onClose) {
        state.currentModal = null;
        state.currentModalKeep = false;
        opts.onClose();
      } else {
        closeModal();
      }
    });
  }
  $("#modalRoot").querySelectorAll("[data-modal-action]").forEach((el) => bindFastTap(el, async () => {
    if (el.disabled) return;
    const b = buttons[Number(el.dataset.modalAction)];
    if (b.action) await b.action();
    else closeModal();
  }));
  const isReducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isTextInput = (el) => !!(el && el.matches && el.matches("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not(:disabled),textarea:not(:disabled),select:not(:disabled)"));
  let activeInput = null;
  let blurCheckTimer = null;
  let vvRaf = 0;
  let vvAnimClearTimer = null;
  let fallbackScrollTimer = null;
  let kbSettleTimer = null;
  let kbCloseTimer = null;
  let kbClosing = false;
  let kbWasVisible = false;
  let userScrolledWhileKb = false;
  let kbActiveScrollEl = null;
  let lastVvH = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
  let lastVvResizeTs = 0;
  let isVvAnimating = false;
  let baseVvH = Math.round(Math.max(window.innerHeight, window.visualViewport ? window.visualViewport.height : 0));
  let scrollAnim = null;

  const cancelScrollAnim = () => {
    if (scrollAnim && scrollAnim.rafId) cancelAnimationFrame(scrollAnim.rafId);
    scrollAnim = null;
  };

  const smoothScrollTo = (el, targetTop, sOpts = {}) => {
    if (!el) {
      if (sOpts.onDone) sOpts.onDone();
      return;
    }
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const clamped = Math.max(0, Math.min(maxTop, Math.round(targetTop)));
    const cur = el.scrollTop;
    const duration = isReducedMotion() ? 0 : (sOpts.duration ?? 380);
    if (duration <= 0 || Math.abs(clamped - cur) < 1.5) {
      cancelScrollAnim();
      if (Math.abs(clamped - cur) >= 0.5) el.scrollTop = clamped;
      if (sOpts.onDone) sOpts.onDone();
      return;
    }
    const smoothTime = Math.max(0.055, (sOpts.smoothTime ?? (duration / 3000)));
    if (scrollAnim && scrollAnim.el === el) {
      scrollAnim.to = clamped;
      scrollAnim.smoothTime = smoothTime;
      if (sOpts.onDone) scrollAnim.onDone = sOpts.onDone;
      return;
    }
    cancelScrollAnim();
    const animState = { el, pos: cur, vel: 0, to: clamped, smoothTime, lastTime: performance.now(), rafId: 0, onDone: sOpts.onDone || null };
    scrollAnim = animState;
    const step = (now) => {
      if (scrollAnim !== animState) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - animState.lastTime) / 1000));
      animState.lastTime = now;
      const dynMax = Math.max(0, animState.el.scrollHeight - animState.el.clientHeight);
      const target = Math.max(0, Math.min(dynMax, animState.to));
      const curPos = animState.pos;
      const omega = 2 / animState.smoothTime;
      const x = omega * dt;
      const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = curPos - target;
      const temp = (animState.vel + omega * change) * dt;
      animState.vel = (animState.vel - omega * temp) * exp;
      let nextPos = target + (change + temp) * exp;
      if ((target - curPos > 0) === (nextPos > target)) {
        nextPos = target;
        animState.vel = 0;
      }
      animState.pos = nextPos;
      animState.el.scrollTop = nextPos;
      if (Math.abs(target - nextPos) < 0.6 && Math.abs(animState.vel) < 12) {
        animState.el.scrollTop = target;
        const done = animState.onDone;
        scrollAnim = null;
        if (done) done();
      } else {
        animState.rafId = requestAnimationFrame(step);
      }
    };
    animState.rafId = requestAnimationFrame(step);
  };

  const getScrollContainerFor = (el) => el?.closest(".modal-scroll-body") || modalEl;

  const clearKbSpacer = () => {
    [modalEl, modalEl.querySelector(".modal-scroll-body")].filter(Boolean).forEach((sc) => {
      sc.dataset.kbSpacer = "0";
      sc.style.removeProperty("--kb-spacer");
    });
  };

  const syncViewportHeight = (fromVvEvent = false) => {
    const vv = window.visualViewport;
    const vvH = vv ? vv.height : window.innerHeight;
    const vvTop = vv ? vv.offsetTop : 0;
    const roundedH = Math.round(vvH);
    const roundedTop = Math.max(0, Math.round(vvTop));
    if (roundedH > baseVvH) baseVvH = roundedH;
    if (fromVvEvent) {
      const now = performance.now();
      const dh = Math.abs(roundedH - lastVvH);
      if (dh > 0 && dh < 160 && (now - lastVvResizeTs) < 90) {
        isVvAnimating = true;
        backdrop.classList.add("vv-animating");
      }
      if (dh > 0) lastVvResizeTs = now;
      clearTimeout(vvAnimClearTimer);
      vvAnimClearTimer = setTimeout(() => {
        isVvAnimating = false;
        backdrop.classList.remove("vv-animating");
      }, 100);
    }
    lastVvH = roundedH;
    document.documentElement.style.setProperty("--vv-base-h", `${baseVvH}px`);
    document.documentElement.style.setProperty("--vv-h", `${roundedH}px`);
    document.documentElement.style.setProperty("--vv-top", `${roundedTop}px`);
    if (backdrop.classList.contains("keyboard-open") && backdrop.scrollTop !== 0) {
      backdrop.scrollTop = 0;
    }
    return { vvH: roundedH, vvTop: roundedTop, kbVisible: (baseVvH - roundedH) > 70 };
  };

  const ensureInputVisible = (el) => {
    if (!el || !$("#modalRoot .modal") || !backdrop.contains(el)) return;
    if (document.activeElement !== el) return;
    kbClosing = false;
    clearTimeout(kbCloseTimer);
    backdrop.classList.remove("kb-closing");
    backdrop.classList.add("keyboard-open");
    const { vvH, vvTop, kbVisible } = syncViewportHeight(false);
    if (kbVisible) kbWasVisible = true;
    if (el.closest(".modal-sticky-footer")) {
      backdrop.scrollTop = 0;
      return;
    }
    const scrollContainer = getScrollContainerFor(el);
    if (!scrollContainer) return;
    kbActiveScrollEl = scrollContainer;
    const isScrollBody = scrollContainer.classList.contains("modal-scroll-body");
    const stickyFooter = isScrollBody ? modalEl.querySelector(".modal-sticky-footer") : null;
    const footerH = stickyFooter ? stickyFooter.offsetHeight : 0;
    const stickyHdr = !isScrollBody ? modalEl.querySelector(":scope > .modal-header") : null;
    const stickyHdrH = (stickyHdr && getComputedStyle(stickyHdr).position === "sticky") ? stickyHdr.offsetHeight : 0;
    const cr = scrollContainer.getBoundingClientRect();
    const isPriceInput = el.classList.contains("price-input");
    const effectiveBottom = isScrollBody ? (vvTop + vvH - 10 - footerH) : (vvTop + vvH - 18);
    const effectiveTop = Math.max(vvTop + 56, cr.top + stickyHdrH + 10);
    const visibleBottom = effectiveBottom - (isPriceInput ? 22 : 20);
    const rowEl = isPriceInput ? el.closest(".store-price-row") : null;
    const useRowTarget = !!(rowEl && rowEl.getBoundingClientRect().height <= Math.max(0, visibleBottom - effectiveTop));
    const targetEl = useRowTarget ? rowEl : (el.closest(".assign-discount-row, .assign-qty-row, .cp-custom-box, .price-wrap, .name-box, .field") || el);
    const r = targetEl.getBoundingClientRect();
    const finalClientH = Math.max(90, effectiveBottom - cr.top);
    const smoothTime = isVvAnimating ? 0.085 : 0.125;
    if (r.bottom > visibleBottom) {
      const delta = r.bottom - visibleBottom;
      const desiredTop = scrollContainer.scrollTop + delta;
      if (scrollAnim && scrollAnim.el === scrollContainer && Math.abs(scrollAnim.to - desiredTop) < 3) return;
      const currentSpacer = Number(scrollContainer.dataset.kbSpacer || 0);
      const naturalScrollH = Math.max(0, scrollContainer.scrollHeight - currentSpacer);
      const refClientH = Math.max(finalClientH, scrollContainer.clientHeight);
      const maxScrollNow = Math.max(0, naturalScrollH - refClientH);
      if (desiredTop > maxScrollNow) {
        const neededSpacer = Math.ceil(desiredTop - maxScrollNow + 32);
        if (neededSpacer > currentSpacer) {
          scrollContainer.dataset.kbSpacer = String(neededSpacer);
          scrollContainer.style.setProperty("--kb-spacer", `${neededSpacer}px`);
        }
      }
      smoothScrollTo(scrollContainer, desiredTop, { smoothTime });
    } else if (r.top < effectiveTop) {
      const delta = r.top - effectiveTop;
      const desiredTop = Math.max(0, scrollContainer.scrollTop + delta);
      if (scrollAnim && scrollAnim.el === scrollContainer && Math.abs(scrollAnim.to - desiredTop) < 3) return;
      smoothScrollTo(scrollContainer, desiredTop, { smoothTime });
    }
  };

  const scheduleKbSettle = (delayMs = 460) => {
    clearTimeout(kbSettleTimer);
    kbSettleTimer = setTimeout(() => {
      kbSettleTimer = null;
      if (!userScrolledWhileKb && activeInput && document.activeElement === activeInput && !kbClosing) {
        ensureInputVisible(activeInput);
      }
    }, delayMs);
  };

  const releaseKeyboard = (forceFromVv = false) => {
    clearTimeout(blurCheckTimer);
    clearTimeout(fallbackScrollTimer);
    clearTimeout(kbSettleTimer);
    if (!forceFromVv) {
      const ae = document.activeElement;
      if (ae && backdrop.contains(ae) && isTextInput(ae)) return;
    }
    if (!backdrop.classList.contains("keyboard-open") || kbClosing) return;
    kbClosing = true;
    if (!forceFromVv) activeInput = null;
    kbWasVisible = false;
    userScrolledWhileKb = false;
    backdrop.classList.add("kb-closing");

    const sc = kbActiveScrollEl || modalEl.querySelector(".modal-scroll-body") || modalEl;
    const currentSpacer = Number(sc?.dataset.kbSpacer || 0);
    const keepTop = sc ? sc.scrollTop : 0;
    const finish = (targetTop = keepTop) => {
      clearTimeout(kbCloseTimer);
      kbClosing = false;
      kbActiveScrollEl = null;
      clearKbSpacer();
      backdrop.classList.remove("keyboard-open", "kb-closing", "vv-animating", "sticky-footer-kb");
      document.documentElement.style.setProperty("--vv-top", "0px");
      if (sc) {
        const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
        const clamped = Math.min(targetTop, maxTop);
        if (Math.abs(sc.scrollTop - clamped) >= 1) sc.scrollTop = clamped;
      }
    };

    if (sc && currentSpacer > 0) {
      const naturalScrollH = Math.max(0, sc.scrollHeight - currentSpacer);
      const isScrollBody = sc.classList.contains("modal-scroll-body");
      const stickyFooter = isScrollBody ? modalEl.querySelector(".modal-sticky-footer") : null;
      const headerEl = isScrollBody ? modalEl.querySelector(".modal-header") : null;
      const estNaturalClientH = isScrollBody
        ? Math.max(sc.clientHeight, Math.min(680, baseVvH - 96) - (stickyFooter?.offsetHeight || 0) - (headerEl?.offsetHeight || 0))
        : Math.max(sc.clientHeight, baseVvH - 32);
      const naturalMaxScroll = Math.max(0, naturalScrollH - estNaturalClientH);
      if (keepTop > naturalMaxScroll + 1) {
        let scrollDone = false;
        let timeDone = false;
        const finishSmooth = () => {
          if (!kbClosing || !scrollDone || !timeDone) return;
          finish(naturalMaxScroll);
        };
        const minSettleMs = isReducedMotion() ? 0 : 280;
        clearTimeout(kbCloseTimer);
        kbCloseTimer = setTimeout(() => {
          timeDone = true;
          finishSmooth();
        }, minSettleMs);
        smoothScrollTo(sc, naturalMaxScroll, {
          duration: minSettleMs,
          onDone: () => {
            scrollDone = true;
            finishSmooth();
          }
        });
        return;
      }
    }
    finish(keepTop);
  };
  backdrop._releaseKeyboard = () => releaseKeyboard(false);

  const onVvResize = () => {
    const prevVvH = lastVvH;
    const info = syncViewportHeight(true);
    if (info.kbVisible) kbWasVisible = true;
    if (prevVvH - info.vvH > 20) userScrolledWhileKb = false;
    if (vvRaf) cancelAnimationFrame(vvRaf);
    vvRaf = requestAnimationFrame(() => {
      vvRaf = 0;
      const cur = syncViewportHeight(false);
      if (cur.kbVisible) {
        kbWasVisible = true;
        clearTimeout(fallbackScrollTimer);
        if (activeInput && document.activeElement === activeInput && !kbClosing) {
          ensureInputVisible(activeInput);
          scheduleKbSettle(260);
        }
      } else if (kbWasVisible && !kbClosing) {
        releaseKeyboard(true);
      }
    });
  };
  const onModalHeightTransitionEnd = (e) => {
    if (e.target !== modalEl) return;
    if (e.propertyName !== "max-height" && e.propertyName !== "height") return;
    if (!scrollAnim && !userScrolledWhileKb && activeInput && document.activeElement === activeInput && !kbClosing && backdrop.classList.contains("keyboard-open")) {
      ensureInputVisible(activeInput);
    }
  };
  modalEl?.addEventListener("transitionend", onModalHeightTransitionEnd);
  syncViewportHeight(false);
  const cleanupTimers = () => {
    clearTimeout(blurCheckTimer);
    clearTimeout(fallbackScrollTimer);
    clearTimeout(kbSettleTimer);
    clearTimeout(kbCloseTimer);
    clearTimeout(vvAnimClearTimer);
    if (vvRaf) cancelAnimationFrame(vvRaf);
    cancelScrollAnim();
    modalEl?.removeEventListener("transitionend", onModalHeightTransitionEnd);
    window.removeEventListener("resize", onVvResize);
    document.documentElement.style.setProperty("--vv-top", "0px");
  };
  window.addEventListener("resize", onVvResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onVvResize);
    window.visualViewport.addEventListener("scroll", onVvResize);
    state.activeModalViewportCleanup = () => {
      cleanupTimers();
      window.visualViewport?.removeEventListener("resize", onVvResize);
      window.visualViewport?.removeEventListener("scroll", onVvResize);
    };
  } else {
    state.activeModalViewportCleanup = cleanupTimers;
  }

  const onUserScrollInteract = () => {
    cancelScrollAnim();
    if (backdrop.classList.contains("keyboard-open")) userScrolledWhileKb = true;
  };
  [modalEl, modalEl.querySelector(".modal-scroll-body")].filter(Boolean).forEach((sc) => {
    sc.addEventListener("touchstart", onUserScrollInteract, { passive: true });
    sc.addEventListener("wheel", onUserScrollInteract, { passive: true });
  });

  backdrop.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!isTextInput(el)) return;
    clearTimeout(blurCheckTimer);
    clearTimeout(fallbackScrollTimer);
    clearTimeout(kbSettleTimer);
    clearTimeout(kbCloseTimer);
    cancelScrollAnim();
    kbClosing = false;
    userScrolledWhileKb = false;
    backdrop.classList.remove("kb-closing");
    activeInput = el;
    const sc = getScrollContainerFor(el);
    kbActiveScrollEl = sc;
    backdrop.classList.add("keyboard-open");
    syncViewportHeight(false);
    fallbackScrollTimer = setTimeout(() => ensureInputVisible(el), 240);
    scheduleKbSettle(480);
  });
  backdrop.addEventListener("focusout", (e) => {
    if (!isTextInput(e.target)) return;
    clearTimeout(blurCheckTimer);
    clearTimeout(fallbackScrollTimer);
    clearTimeout(kbSettleTimer);
    blurCheckTimer = setTimeout(() => releaseKeyboard(false), 90);
  });
  backdrop.onclick = (e) => {
    if (!e.target.closest("input,textarea,select")) {
      const ae = document.activeElement;
      if (!ae || !backdrop.contains(ae) || !isTextInput(ae)) {
        releaseKeyboard(false);
      }
    }
    if (!e.target.closest(".custom-dropdown")) {
      backdrop.querySelectorAll(".custom-dropdown-menu").forEach((m) => m.hidden = true);
      backdrop.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
    if (!e.target.closest(".prod-um-dd")) {
      backdrop.querySelectorAll(".prod-um-menu").forEach((m) => m.hidden = true);
      backdrop.querySelectorAll(".prod-um-btn").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
    if (e.target.id === "modalBackdrop" && opts.backdropClose !== false) {
      if (opts.keepModalOnClose && opts.onClose) {
        state.currentModal = null;
        state.currentModalKeep = false;
        opts.onClose();
      } else {
        closeModal();
      }
    }
  };
  const scrollTarget = modalEl.querySelector(".modal-scroll-body") || modalEl;
  scrollTarget.addEventListener("scroll", updateScrollTopButton, { passive: true });
  updateScrollTopButton();
  decorateAuto();
}

export function decorateInput(inp, opts = {}) {
  let initial = opts.initial !== void 0 ? opts.initial : inp.value;
  const box = document.createElement("div");
  box.className = "name-box";
  inp.replaceWith(box);
  box.appendChild(inp);
  const no = document.createElement("button");
  no.type = "button";
  no.className = "name-no";
  no.title = "Annulla modifica";
  no.innerHTML = SVG_X;
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "name-ok";
  ok.title = "Conferma";
  ok.innerHTML = SVG_CHK;
  box.append(no, ok);
  const upd = () => box.classList.toggle("dirty", inp.value.trim() !== String(initial).trim());
  const showCaret = () => inp.classList.remove("caret-hidden");
  const hideCaretKeepFocus = () => {
    inp.focus({ preventScroll: true });
    try {
      const len = inp.value.length;
      inp.setSelectionRange(len, len);
    } catch {}
    inp.classList.add("caret-hidden");
  };
  inp.addEventListener("input", () => {
    showCaret();
    upd();
  });
  if (opts.keepFocus) {
    inp.addEventListener("pointerdown", showCaret);
    inp.addEventListener("keydown", showCaret);
    inp.addEventListener("beforeinput", showCaret);
  }
  const doNo = () => {
    inp.value = initial;
    upd();
    if (opts.onNo) opts.onNo();
    if (opts.keepFocus) hideCaretKeepFocus();
    else inp.blur();
  };
  const doOk = () => {
    initial = inp.value;
    if (opts.onOk) opts.onOk();
    else if (opts.keepFocus) hideCaretKeepFocus();
    else inp.blur();
    upd();
  };
  const bindBtn = (btn, fn) => {
    let lastTouchTs = 0;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    if (opts.keepFocus) {
      btn.addEventListener("touchstart", (e) => {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      btn.addEventListener("touchend", (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        lastTouchTs = Date.now();
        fn();
      }, { passive: false });
    }
    btn.addEventListener("click", (e) => {
      if (Date.now() - lastTouchTs < 400) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      fn();
    });
  };
  bindBtn(no, doNo);
  bindBtn(ok, doOk);
  return { upd, setInitial: (v) => { initial = v; upd(); } };
}

export function decorateAuto() {
  ["newCatName"].forEach((id) => {
    const i = document.getElementById(id);
    if (i && !i.closest(".name-box")) decorateInput(i, { keepFocus: id === "newCatName" });
  });
}

export function attachSearchClear(inp, cb) {
  const box = document.createElement("div");
  box.className = "search-box";
  inp.replaceWith(box);
  box.appendChild(inp);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "search-clear";
  b.setAttribute("aria-label", "Cancella testo");
  b.textContent = "\xD7";
  box.appendChild(b);
  const upd = () => {
    b.hidden = !inp.value;
  };
  upd();
  inp.addEventListener("input", upd);
  b.addEventListener("click", () => {
    inp.value = "";
    upd();
    cb();
    inp.focus();
  });
}

export function fitNames(root = document) {
  root.querySelectorAll(".fit-name").forEach((el) => {
    let fs = 15;
    el.style.fontSize = fs + "px";
    while (el.scrollWidth > el.clientWidth && fs > 11) {
      fs -= 0.5;
      el.style.fontSize = fs + "px";
    }
  });
}

export function setDropdownValue(id, val) {
  const f = $("#" + id), l = $("#" + id + "Label");
  if (!f) return;
  const opts = [...document.querySelectorAll(`[data-dropdown-id="${id}"]`)], o = opts.find((x) => x.dataset.value === val) || opts[0];
  if (!o) return;
  f.value = o.dataset.value;
  if (l) {
    if (o.dataset.labelHtml) l.innerHTML = o.dataset.labelHtml;
    else l.textContent = o.dataset.label;
    l.classList.toggle("it", o.dataset.value === "__none__");
  }
  opts.forEach((x) => {
    x.classList.toggle("selected", x === o);
    x.setAttribute("aria-selected", String(x === o));
  });
}

export function setPage(p, opts = {}) {
  if (state.page === "list" && p !== "list") state.listScrollY = window.scrollY;
  const returningToList = p === "list" && state.page !== "list";
  const remember = opts.remember !== false;
  if (p !== state.page && remember) state.pageStack.push(state.page);
  state.page = p;
  state.pendingScrollTop = !returningToList;
  if (returningToList) state.restoreListScroll = true;
  render();
}

export function updateNav() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const target = b.dataset.page;
    const active = target === state.page || target === "stores" && state.page === "storeDetail";
    b.classList.toggle("active", active);
  });
}

export function updateScrollTopButton(ev) {
  updateFloatingAddButton();
  const btn = $("#productsTopBtn");
  if (!btn) return;
  const modalEl = $("#modalRoot .modal-backdrop:not(.modal-closing) .modal");
  let eligible;
  if (modalEl) {
    const scrollTarget = modalEl.querySelector(".modal-scroll-body") || modalEl;
    btn.style.zIndex = "40";
    const stickyFooter = modalEl.classList.contains("modal-has-sticky-footer") && modalEl.querySelector(".product-editor")
      ? modalEl.querySelector(".modal-sticky-footer")
      : null;
    if (stickyFooter) {
      const fRect = stickyFooter.getBoundingClientRect();
      btn.style.bottom = fRect.height > 0
        ? `${Math.max(16, Math.round(window.innerHeight - fRect.top) + 12)}px`
        : "calc(168px + env(safe-area-inset-bottom))";
    } else {
      btn.style.bottom = modalEl.classList.contains("modal-has-sticky-footer")
        ? (modalEl.querySelector(".modal-sticky-footer .new-prod-add-list-box") ? "calc(176px + env(safe-area-inset-bottom))" : "calc(108px + env(safe-area-inset-bottom))")
        : "calc(84px + env(safe-area-inset-bottom))";
    }
    eligible = scrollTarget.scrollTop > 220;
  } else {
    btn.style.zIndex = "12";
    btn.style.bottom = state.page === "list" ? "calc(138px + env(safe-area-inset-bottom))" : "calc(84px + env(safe-area-inset-bottom))";
    eligible = ["list", "products", "categories", "stores"].includes(state.page) && window.scrollY > 220;
  }
  clearTimeout(state.topBtnTimer);
  if (!eligible) {
    btn.classList.remove("visible");
    return;
  }
  if (ev && ev.type === "scroll") {
    btn.classList.add("visible");
    state.topBtnTimer = setTimeout(() => btn.classList.remove("visible"), 1800);
  } else if (btn.classList.contains("visible")) state.topBtnTimer = setTimeout(() => btn.classList.remove("visible"), 1800);
}

export function updateFloatingAddButton() {
  const wrap = $("#floatingAddWrap");
  if (wrap) wrap.classList.add("hidden");
}

export function isInstalledPwa() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.matchMedia?.("(display-mode: minimal-ui)")?.matches ||
    window.navigator?.standalone === true
  );
}

export function handleAppBack() {
  if (isInstalledPwa()) return;
  try {
    history.pushState({ spesaSuMisuraBackGuard: true }, "");
  } catch (_) {}
  window.addEventListener("popstate", async () => {
    if ($("#modalRoot .modal-backdrop:not(.modal-closing) .modal")) closeModal();
    else if (state.pageStack.length) {
      const previous = state.pageStack.pop();
      setPage(previous, { remember: false });
    } else return;
    try {
      history.pushState({ spesaSuMisuraBackGuard: true }, "");
    } catch (_) {}
  });
}

export async function confirmDialog(title, message, confirmText = "Elimina", opts = {}) {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  return new Promise((resolve) => {
    let settled = false;
    const settleFalse = () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    };
    const onDismiss = async () => {
      settleFalse();
      if (typeof opts.onClose === "function") await opts.onClose();
    };
    const useThemed = opts.themed !== undefined ? !!opts.themed : Boolean(title);
    if (opts.overlay) {
      const root = $("#modalRoot");
      const closeButton = opts.closeButton ? `<button class="modal-close" type="button" aria-label="Chiudi" title="Chiudi">\xD7</button>` : "";
      const cancelLabel = opts.cancelLabel || "Annulla";
      const btns = opts.singleButton ? [{ label: confirmText, class: opts.confirmClass || "btn-primary", kind: "confirm" }] : (opts.cancelFirst ? [{ label: cancelLabel, class: "btn-plain", kind: "cancel" }, { label: confirmText, class: opts.confirmClass || "btn-danger", kind: "confirm" }] : [{ label: confirmText, class: opts.confirmClass || "btn-danger", kind: "confirm" }, { label: cancelLabel, class: "btn-plain", kind: "cancel" }]);
      const overlay = document.createElement("div");
      overlay.className = "modal-backdrop modal-overlay modal-opening";
      overlay.id = "confirmOverlayBackdrop";
      overlay.innerHTML = `<section class="modal${useThemed ? " modal-themed" : ""} modal-enter" role="dialog" aria-modal="true" aria-label="${esc(title || "Conferma")}" tabindex="-1"><div class="modal-header"><h2>${esc(title)}</h2>${closeButton}</div><p>${message}</p><div class="modal-actions">${btns.map((b) => `<button type="button" class="btn ${b.class}" data-overlay-kind="${b.kind}">${esc(b.label)}</button>`).join("")}</div></section>`;
      const cleanup = () => {
        if (state.activeConfirmOverlayDismiss === dismiss) state.activeConfirmOverlayDismiss = null;
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        if (reducedMotion || overlay.classList.contains("modal-closing")) {
          overlay.remove();
        } else {
          overlay.classList.remove("modal-opening");
          overlay.classList.add("modal-closing");
          setTimeout(() => overlay.remove(), 285);
        }
      };
      const dismiss = () => {
        cleanup();
        onDismiss();
      };
      state.activeConfirmOverlayDismiss = dismiss;
      bindFastTap(overlay.querySelector(".modal-close"), dismiss);
      bindFastTap(overlay.querySelector('[data-overlay-kind="cancel"]'), dismiss);
      bindFastTap(overlay.querySelector('[data-overlay-kind="confirm"]'), () => {
        cleanup();
        if (typeof opts.onConfirm === "function") opts.onConfirm();
        if (!settled) {
          settled = true;
          resolve(true);
        }
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay && opts.backdropClose !== false) dismiss();
      });
      root.appendChild(overlay);
      return;
    }
    const confirmBtn = { label: confirmText, class: opts.confirmClass || "btn-danger", action: () => {
      if (opts.keepOnConfirm) {
        state.currentModal = null;
        state.currentModalKeep = false;
      } else {
        closeModal(false);
      }
      if (typeof opts.onConfirm === "function") opts.onConfirm();
      if (!settled) {
        settled = true;
        resolve(true);
      }
    } };
    const cancelBtn = { label: opts.cancelLabel || "Annulla", class: "btn-plain", action: () => {
      settleFalse();
      closeModal();
    } };
    modal(title, opts.rawBody ? message : `<p>${message}</p>`, opts.cancelFirst ? [cancelBtn, confirmBtn] : [confirmBtn, cancelBtn], { closeButton: !!opts.closeButton, backdropClose: opts.backdropClose, keepModalOnClose: !!opts.keepModalOnClose, center: !!opts.center, themed: useThemed, onClose: onDismiss });
  });
}

export function goPage(p, opts = {}) {
  setPage(p, opts);
}

export function updateStickyHeaderOffset() {
  const hdr = document.querySelector(".app-header");
  if (hdr) document.documentElement.style.setProperty("--header-h", hdr.offsetHeight + "px");
}

export function multiFilterSummaryHtml({ allLabel, emptyLabel, options, selected, showAll }) {
  if (showAll) return esc(allLabel);
  const selectedSet = new Set(selected || []);
  return options.filter((o) => !o.disabled && selectedSet.has(o.id)).map((o) => o.html || esc(o.label)).join(", ") || esc(emptyLabel);
}

export function multiFilterHtml({ id, allLabel, emptyLabel, options, selected, showAll, allDisabled, keepOpen = false, searchQuery = "", searchMaxLength = null, searchUppercase = false }) {
  const selectedSet = new Set(selected || []);
  const active = !allDisabled && !showAll;
  const summaryHtml = multiFilterSummaryHtml({ allLabel, emptyLabel, options, selected, showAll });
  const initQuery = (Number.isInteger(searchMaxLength) && searchMaxLength > 0 ? String(searchQuery || "").slice(0, searchMaxLength) : String(searchQuery || ""));
  const displayQuery = searchUppercase ? initQuery.toLocaleUpperCase("it") : initQuery;
  const q = searchNorm(displayQuery);
  let visibleCount = 0;
  const orderedOpts = q ? filterBySearch(options, q, (o) => o.label).concat(options.filter((o) => searchRank(o.label, q) < 0)) : options;
  const optsHtml = orderedOpts.map((opt) => {
    const checked = !opt.disabled && (showAll || selectedSet.has(opt.id));
    const isHidden = !!q && searchRank(opt.label, q) < 0;
    if (!isHidden) visibleCount++;
    return `<label class="check-line${opt.disabled ? " is-disabled" : ""}" data-filter-label="${esc(opt.label)}"${isHidden ? " hidden" : ""}><input type="checkbox" data-filter-opt="${esc(id)}" data-value="${esc(opt.id)}" ${checked ? "checked" : ""} ${opt.disabled ? "disabled" : ""}> <span>${opt.html || esc(opt.label)}</span></label>`;
  }).join("");
  const emptyHidden = !q || visibleCount > 0;
  const searchMaxAttr = Number.isInteger(searchMaxLength) && searchMaxLength > 0 ? ` maxlength="${searchMaxLength}"` : "";
  const searchUpperAttr = searchUppercase ? ' autocapitalize="characters"' : "";
  const searchCls = searchUppercase ? "dd-search force-upper" : "dd-search";
  return `<div class="store-filter-wrap" data-multi-filter="${esc(id)}"><button type="button" class="store-filter-trigger${active ? " has-filter" : ""}" id="${esc(id)}Trigger" aria-haspopup="true" aria-expanded="${keepOpen ? "true" : "false"}"><span id="${esc(id)}Summary">${summaryHtml}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="store-filter-chevron" style="width:18px;height:18px;color:#174f86"><path d="m6 9 6 6 6-6"/></svg></button><div class="store-filter-menu" id="${esc(id)}Menu" ${keepOpen ? "" : "hidden"}><div class="dd-search-wrap"><input type="text" class="${searchCls}" placeholder="Cerca\u2026" autocomplete="off"${searchMaxAttr}${searchUpperAttr} value="${esc(displayQuery)}"><button type="button" class="dd-clear" ${displayQuery ? "" : "hidden"} aria-label="Cancella testo">\xD7</button></div><label class="check-line filter-all-row${allDisabled ? " is-disabled" : ""}"${q ? " hidden" : ""}><input type="checkbox" data-filter-all="${esc(id)}" ${!allDisabled && showAll ? "checked" : ""} ${allDisabled ? "disabled" : ""}> <span>Seleziona tutti</span></label>${optsHtml}<div class="filter-empty-msg muted small"${emptyHidden ? " hidden" : ""}>Nessun risultato.</div></div></div>`;
}

export function updateMultiFilterUI(id, { allLabel, emptyLabel, options, selected, showAll, allDisabled }) {
  const trigger = $(`#${id}Trigger`), summary = $(`#${id}Summary`), menu = $(`#${id}Menu`);
  if (!trigger || !menu) return;
  const active = !allDisabled && !showAll;
  trigger.classList.toggle("has-filter", active);
  if (summary) summary.innerHTML = multiFilterSummaryHtml({ allLabel, emptyLabel, options, selected, showAll });
  const allCb = menu.querySelector(`[data-filter-all="${id}"]`);
  if (allCb) {
    allCb.checked = !allDisabled && showAll;
    allCb.disabled = !!allDisabled;
    allCb.closest(".check-line")?.classList.toggle("is-disabled", !!allDisabled);
  }
  const optMap = new Map(options.map((o) => [o.id, o]));
  const selectedSet = new Set(selected || []);
  menu.querySelectorAll(`[data-filter-opt="${id}"]`).forEach((cb) => {
    const opt = optMap.get(cb.dataset.value);
    const dis = !opt || !!opt.disabled;
    cb.disabled = dis;
    cb.checked = !dis && (showAll || selectedSet.has(cb.dataset.value));
    cb.closest(".check-line")?.classList.toggle("is-disabled", dis);
  });
}

export function wireMultiFilter(id, { onAllChange, onItemChange, searchMaxLength = null, searchUppercase = false }) {
  const trigger = $(`#${id}Trigger`), menu = $(`#${id}Menu`);
  if (!trigger || !menu) return;
  const ds = menu.querySelector(".dd-search"), dcl = menu.querySelector(".dd-clear");
  const allRow = menu.querySelector(".filter-all-row"), emptyMsg = menu.querySelector(".filter-empty-msg");
  const maxLen = Number.isInteger(searchMaxLength) && searchMaxLength > 0 ? searchMaxLength : (ds && ds.maxLength > 0 ? ds.maxLength : 0);
  if (ds && maxLen) ds.maxLength = maxLen;
  if (ds && searchUppercase) forceUppercaseInput(ds);
  const applySearch = () => {
    if (!ds) return;
    if (maxLen && ds.value.length > maxLen) ds.value = ds.value.slice(0, maxLen);
    if (dcl) dcl.hidden = !ds.value;
    const q = searchNorm(ds.value);
    if (allRow) allRow.hidden = !!q;
    const rows = [...menu.querySelectorAll("[data-filter-label]")];
    const vis = applyDropdownSearch(menu, rows, ds.value, (row) => row.dataset.filterLabel, { insertBefore: emptyMsg });
    if (emptyMsg) emptyMsg.hidden = !q || vis > 0;
  };
  if (dcl) {
    dcl.addEventListener("mousedown", (e) => e.preventDefault());
    dcl.addEventListener("click", (e) => {
      e.stopPropagation();
      ds.value = "";
      applySearch();
    });
  }
  ds?.addEventListener("input", applySearch);
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    document.querySelectorAll(".custom-dropdown-menu").forEach((m) => {
      m.hidden = true;
      m.classList.remove("drop-up");
    });
    document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".store-filter-menu").forEach((m) => {
      if (m !== menu) m.hidden = true;
    });
    document.querySelectorAll(".store-filter-trigger").forEach((t) => {
      if (t !== trigger) t.setAttribute("aria-expanded", "false");
    });
    if (willOpen) {
      if (ds) {
        ds.value = "";
        applySearch();
      }
      const r = trigger.getBoundingClientRect(), mr = trigger.closest(".modal")?.getBoundingClientRect();
      const navTop = !mr ? (document.querySelector(".bottom-nav")?.getBoundingClientRect()?.top ?? window.innerHeight) : mr.bottom;
      const below = (mr ? mr.bottom : navTop - 8) - r.bottom;
      menu.style.maxHeight = Math.max(180, Math.min(480, Math.floor(below - 10))) + "px";
      menu.scrollTop = 0;
    }
    menu.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  const allCb = menu.querySelector(`[data-filter-all="${id}"]`);
  allCb?.addEventListener("change", (e) => onAllChange(e.target.checked, menu, ds ? ds.value : ""));
  menu.querySelectorAll(`[data-filter-opt="${id}"]`).forEach((cb) => {
    cb.addEventListener("change", () => {
      const ids = [...menu.querySelectorAll(`[data-filter-opt="${id}"]:not(:disabled):checked`)].map((x) => x.dataset.value);
      onItemChange(ids, menu, ds ? ds.value : "");
    });
  });
}

export function singleFilterHtml({ id, allLabel, options, selectedValue, allDisabled = false, keepOpen = false, searchQuery = "", searchMaxLength = null, searchUppercase = false }) {
  const selectedId = selectedValue || "all";
  const allOptions = [{ id: "all", label: allLabel, html: "", disabled: false }].concat(options || []);
  const current = allOptions.find((o) => o.id === selectedId) || allOptions[0];
  const active = !allDisabled && selectedId !== "all";
  const q = searchNorm(searchQuery || "");
  let visibleCount = 0;
  const orderedOpts = q ? filterBySearch(allOptions, q, (o) => o.label).concat(allOptions.filter((o) => searchRank(o.label, q) < 0)) : allOptions;
  const optsHtml = orderedOpts.map((opt) => {
    const selected = opt.id === selectedId;
    const isHidden = !!q && searchRank(opt.label, q) < 0;
    if (!isHidden) visibleCount++;
    return `<button type="button" class="custom-dropdown-option${selected ? " selected" : ""}${opt.disabled ? " is-disabled" : ""}" role="option" aria-selected="${selected ? "true" : "false"}" ${opt.disabled ? 'disabled aria-disabled="true"' : ""} data-filter-opt="${esc(id)}" data-value="${esc(opt.id)}" data-filter-label="${esc(opt.label)}"${isHidden ? " hidden" : ""}>${opt.html || esc(opt.label)}</button>`;
  }).join("");
  const emptyHidden = !q || visibleCount > 0;
  const searchMaxAttr = Number.isInteger(searchMaxLength) && searchMaxLength > 0 ? ` maxlength="${searchMaxLength}"` : "";
  const searchUpperAttr = searchUppercase ? ' autocapitalize="characters"' : "";
  const searchCls = searchUppercase ? "dd-search force-upper" : "dd-search";
  return `<div class="store-filter-wrap" data-single-filter="${esc(id)}"><button type="button" class="store-filter-trigger${active ? " has-filter" : ""}" id="${esc(id)}Trigger" aria-haspopup="listbox" aria-expanded="${keepOpen ? "true" : "false"}"><span id="${esc(id)}Summary">${current.html || esc(current.label)}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="store-filter-chevron" style="width:18px;height:18px;color:#174f86"><path d="m6 9 6 6 6-6"/></svg></button><div class="store-filter-menu" id="${esc(id)}Menu" role="listbox" ${keepOpen ? "" : "hidden"}><div class="dd-search-wrap"><input type="text" class="${searchCls}" placeholder="Cerca\u2026" autocomplete="off"${searchMaxAttr}${searchUpperAttr} value="${esc(searchQuery || "")}"><button type="button" class="dd-clear" ${searchQuery ? "" : "hidden"} aria-label="Cancella testo">\xD7</button></div>${optsHtml}<div class="filter-empty-msg muted small"${emptyHidden ? " hidden" : ""}>Nessun risultato.</div></div></div>`;
}

export function updateSingleFilterUI(id, { allLabel, options, selectedValue, allDisabled = false }) {
  const trigger = $(`#${id}Trigger`), summary = $(`#${id}Summary`), menu = $(`#${id}Menu`);
  if (!trigger || !menu) return;
  const selectedId = selectedValue || "all";
  const allOptions = [{ id: "all", label: allLabel, html: "", disabled: false }].concat(options || []);
  const current = allOptions.find((o) => o.id === selectedId) || allOptions[0];
  const active = !allDisabled && selectedId !== "all";
  trigger.classList.toggle("has-filter", active);
  if (summary) summary.innerHTML = current.html || esc(current.label);
  const optMap = new Map(allOptions.map((o) => [o.id, o]));
  menu.querySelectorAll(`[data-filter-opt="${id}"]`).forEach((btn) => {
    const opt = optMap.get(btn.dataset.value);
    const dis = !opt || !!opt.disabled;
    const sel = !dis && btn.dataset.value === selectedId;
    btn.disabled = dis;
    btn.setAttribute("aria-disabled", dis ? "true" : "false");
    btn.classList.toggle("is-disabled", dis);
    btn.classList.toggle("selected", sel);
    btn.setAttribute("aria-selected", String(sel));
  });
}

export function wireSingleFilter(id, { onSelect, searchMaxLength = null, searchUppercase = false }) {
  const trigger = $(`#${id}Trigger`), menu = $(`#${id}Menu`);
  if (!trigger || !menu) return;
  const ds = menu.querySelector(".dd-search"), dcl = menu.querySelector(".dd-clear");
  const emptyMsg = menu.querySelector(".filter-empty-msg");
  const maxLen = Number.isInteger(searchMaxLength) && searchMaxLength > 0 ? searchMaxLength : (ds && ds.maxLength > 0 ? ds.maxLength : 0);
  if (ds && maxLen) ds.maxLength = maxLen;
  if (ds && searchUppercase) forceUppercaseInput(ds);
  const applySearch = () => {
    if (!ds) return;
    if (maxLen && ds.value.length > maxLen) ds.value = ds.value.slice(0, maxLen);
    if (dcl) dcl.hidden = !ds.value;
    const q = searchNorm(ds.value);
    const rows = [...menu.querySelectorAll("[data-filter-label]")];
    const vis = applyDropdownSearch(menu, rows, ds.value, (row) => row.dataset.filterLabel, { insertBefore: emptyMsg });
    if (emptyMsg) emptyMsg.hidden = !q || vis > 0;
  };
  const scrollToSelected = () => {
    if (menu.hidden || (ds && ds.value)) return;
    const sel = menu.querySelector(".custom-dropdown-option.selected:not([hidden])");
    if (!sel || sel.dataset.value === "all") {
      menu.scrollTop = 0;
      return;
    }
    const sw = menu.querySelector(".dd-search-wrap");
    const swH = sw ? sw.offsetHeight : 0;
    const selTop = sel.getBoundingClientRect().top - menu.getBoundingClientRect().top + menu.scrollTop;
    const visibleH = Math.max(0, menu.clientHeight - swH);
    const offset = visibleH > sel.offsetHeight ? Math.floor((visibleH - sel.offsetHeight) / 2) : 4;
    menu.scrollTop = Math.max(0, selTop - swH - Math.max(4, offset));
  };
  if (dcl) {
    dcl.addEventListener("mousedown", (e) => e.preventDefault());
    dcl.addEventListener("click", (e) => {
      e.stopPropagation();
      ds.value = "";
      applySearch();
      scrollToSelected();
    });
  }
  ds?.addEventListener("input", applySearch);
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    document.querySelectorAll(".custom-dropdown-menu").forEach((m) => {
      m.hidden = true;
      m.classList.remove("drop-up");
    });
    document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".store-filter-menu").forEach((m) => {
      if (m !== menu) m.hidden = true;
    });
    document.querySelectorAll(".store-filter-trigger").forEach((t) => {
      if (t !== trigger) t.setAttribute("aria-expanded", "false");
    });
    if (willOpen) {
      if (ds) {
        ds.value = "";
        applySearch();
      }
      const r = trigger.getBoundingClientRect(), mr = trigger.closest(".modal")?.getBoundingClientRect();
      const navTop = !mr ? (document.querySelector(".bottom-nav")?.getBoundingClientRect()?.top ?? window.innerHeight) : mr.bottom;
      const below = (mr ? mr.bottom : navTop - 8) - r.bottom;
      menu.style.maxHeight = Math.max(180, Math.min(480, Math.floor(below - 10))) + "px";
    }
    menu.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      scrollToSelected();
      requestAnimationFrame(scrollToSelected);
    }
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  menu.querySelectorAll(`[data-filter-opt="${id}"]`).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      onSelect(btn.dataset.value);
    });
  });
}

export function customDropdown(id, selectedId, options, includeNone = true, inline = false, searchable = false) {
  const choices = (includeNone ? [{ id: "", name: "Nessuno", menuName: "Nessuno", labelHtml: "", menuHtml: "", disabled: false }] : []).concat(options.map((x) => ({ id: x.id, name: x.name, menuName: x.menuName || x.name, labelHtml: x.labelHtml || "", menuHtml: x.menuHtml || "", disabled: !!x.disabled })));
  const current = choices.find((x) => x.id === (selectedId || "")) || choices[0] || { id: "", name: "Nessuno", menuName: "Nessuno", labelHtml: "", menuHtml: "" };
  return `<div class="custom-dropdown${inline ? " inline-dd" : ""}" data-custom-dropdown="${esc(id)}"><input type="hidden" id="${esc(id)}" value="${esc(current.id)}"><button type="button" class="custom-dropdown-trigger" id="${esc(id)}Trigger" aria-haspopup="listbox" aria-expanded="false"><span id="${esc(id)}Label"${current.id === "__none__" ? ' class="it"' : ""}>${current.labelHtml || esc(current.name)}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><div class="custom-dropdown-menu" id="${esc(id)}Menu" role="listbox" hidden>${searchable ? '<div class="dd-search-wrap"><input type="text" class="dd-search" placeholder="Cerca\u2026" autocomplete="off"><button type="button" class="dd-clear" hidden aria-label="Cancella testo">\xD7</button></div>' : ""}${choices.map((x) => `<button type="button" class="custom-dropdown-option ${x.id === current.id ? "selected" : ""}${x.disabled ? " is-disabled" : ""}" role="option" aria-selected="${x.id === current.id ? "true" : "false"}" ${x.disabled ? 'disabled aria-disabled="true"' : ""} data-dropdown-id="${esc(id)}" data-value="${esc(x.id)}" data-label="${esc(x.name)}"${x.labelHtml ? ` data-label-html="${esc(x.labelHtml)}"` : ""}>${x.menuHtml || x.labelHtml || esc(x.menuName || x.name)}</button>`).join("")}</div></div>`;
}

export function wireCustomDropdown(id) {
  const ds0 = $(`#${id}Menu .dd-search`);
  if (ds0) {
    const tr = $(`#${id}Trigger`), mn = $(`#${id}Menu`);
    const dcl = ds0.parentElement.querySelector(".dd-clear");
    const runSearch = () => {
      dcl.hidden = !ds0.value;
      const opts = [...mn.querySelectorAll(".custom-dropdown-option")];
      applyDropdownSearch(mn, opts, ds0.value, (o) => o.dataset.label, { keepLast: (o) => o.dataset.value === "__new__" });
    };
    dcl.addEventListener("mousedown", (e) => e.preventDefault());
    dcl.addEventListener("click", () => {
      ds0.value = "";
      runSearch();
      ds0.blur();
    });
    ds0.addEventListener("input", runSearch);
    tr.addEventListener("click", () => {
      setTimeout(() => {
        if (!mn.hidden) {
          ds0.value = "";
          runSearch();
        }
      }, 40);
    });
  }
  const trigger = $(`#${id}Trigger`), menu = $(`#${id}Menu`), field = $(`#${id}`);
  if (!trigger || !menu || !field) return;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    document.querySelectorAll(".custom-dropdown-menu").forEach((m) => {
      if (m !== menu) {
        m.hidden = true;
        m.classList.remove("drop-up");
      }
    });
    document.querySelectorAll(".custom-dropdown-trigger").forEach((t) => {
      if (t !== trigger) t.setAttribute("aria-expanded", "false");
    });
    if (willOpen) {
      const r = trigger.getBoundingClientRect(), mr = trigger.closest(".modal")?.getBoundingClientRect();
      const navTop = !mr ? (document.querySelector(".bottom-nav")?.getBoundingClientRect()?.top ?? window.innerHeight) : window.innerHeight;
      const below = (mr ? mr.bottom : navTop - 8) - r.bottom;
      const above = r.top - (mr ? mr.top : 74);
      const dropUp = below < Math.min(138, menu.scrollHeight) && above > below;
      menu.classList.toggle("drop-up", dropUp);
      if (!mr) {
        menu.style.maxHeight = Math.max(180, Math.floor((dropUp ? above : below) - 8)) + "px";
      } else {
        menu.style.maxHeight = "";
      }
    }
    menu.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) fitStoreChipLabels(menu);
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  menu.querySelectorAll("[data-dropdown-id]").forEach((option) => option.addEventListener("click", (e) => {
    e.stopPropagation();
    if (option.disabled) return;
    field.value = option.dataset.value;
    const label = $(`#${id}Label`);
    if (label) {
      if (option.dataset.labelHtml) label.innerHTML = option.dataset.labelHtml;
      else label.textContent = option.dataset.label;
      label.classList.toggle("it", option.dataset.value === "__none__");
    }
    fitStoreChipLabels(trigger);
    menu.querySelectorAll(".custom-dropdown-option").forEach((x) => {
      const selected = x === option;
      x.classList.toggle("selected", selected);
      x.setAttribute("aria-selected", String(selected));
    });
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }));
}

export function deleteIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c62828"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
}
