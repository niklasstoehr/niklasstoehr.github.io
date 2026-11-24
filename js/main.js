/* ═══════════════════════════════════════════════════════════════
   Niklas Stoehr — Cross-browser views, click-to-stamp words, figs
   ═══════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ═════════ 1. PAGE SWITCHING ═════════ */
  const pages = {
    home: $("#page-home"),
    publications: $("#page-publications"),
    cv: $("#page-cv")
  };
  const floatWrap = $("#pub-float-wrap");
  const floatFig = $("#pub-float-fig");
  const stickyWordEl = $("#sticky-word");
  const pinnedLayer = $("#pinned-layer");

  let activeView = "home";
  let heldItems = []; // [{ word, el, x, y, offX, offY, pop }]
  let cursorPop = 0;  // bubble pop impulse on attachment

  function hideFig() {
    if (floatWrap) floatWrap.classList.remove("show");
  }

  function showPage(name, pushHash = true) {
    if (!pages[name]) name = "home";
    activeView = name;
    hideFig();

    Object.entries(pages).forEach(([k, el]) => {
      if (k === name) {
        el.hidden = false;
        requestAnimationFrame(() => el.classList.add("active"));
      } else {
        el.classList.remove("active");
        el.hidden = true;
      }
    });

    if (stickyWordEl) stickyWordEl.style.display = name === "home" ? "block" : "none";
    if (pinnedLayer) pinnedLayer.style.display = name === "home" ? "block" : "none";

    $$(".bar-primary a").forEach((a) => a.classList.toggle("current", a.dataset.page === name));
    window.scrollTo(0, 0);

    if (pushHash) {
      const targetHash = name === "home" ? "#home" : "#" + name;
      if (location.hash !== targetHash) history.pushState(null, "", targetHash);
    }
  }

  $$("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.dataset.page;
      if (el.classList.contains("identity")) {
        if (activeView !== "home") showPage("home", true);
        returnAllWordsHome();
        return;
      }
      showPage(target, true);
    });
  });

  addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "") || "home";
    if (h !== activeView) showPage(h, false);
  });

  /* ═════════ 2. LIQUID BUBBLE-SOAK PULL + STICK + CLICK-TO-DROP ON HOME ═════════ */
  const magnetEls = [];
  let dropCooldownUntil = 0;

  function registerMagnet(el, word, isPinned, needsLeave = false) {
    magnetEls.push({
      el,
      word,
      isPinned,
      needsLeave,
      tx: 0, ty: 0, sx: 1, sy: 1, sk: 0
    });
  }

  function pickUpWord(word, startRect) {
    if (!stickyWordEl || heldItems.some((h) => h.word === word)) return;

    const el = document.createElement("span");
    el.className = "held-word";
    el.textContent = word;
    el.style.left = `${startRect.left.toFixed(1)}px`;
    el.style.top = `${startRect.top.toFixed(1)}px`;
    stickyWordEl.appendChild(el);

    // Keep the exact natural approach offset relative to the cursor — zero sudden jump!
    const offX = startRect.left - mx;
    const offY = startRect.top - my;

    heldItems.push({
      word,
      el,
      x: startRect.left,
      y: startRect.top,
      offX,
      offY,
      pop: 0.16
    });

    // Pop & swell the orange cursor bubble on attachment!
    cursorPop = 1.9;
  }

  function dropItem(item, clampAboveBar = false) {
    if (!item || !pinnedLayer) return;
    item.el.remove();
    const span = document.createElement("span");
    span.className = "pinned-word";
    span.textContent = item.word;
    const dropY = clampAboveBar ? Math.min(item.y, innerHeight - 110) : item.y;
    span.style.left = `${item.x.toFixed(1)}px`;
    span.style.top = `${dropY.toFixed(1)}px`;
    pinnedLayer.appendChild(span);
    registerMagnet(span, item.word, true, true);
  }

  // LIFO stack: clicking only drops the LAST element added to the cursor
  function dropTopWord() {
    if (!heldItems.length) return;
    const topItem = heldItems.pop();
    dropCooldownUntil = performance.now() + 420;
    dropItem(topItem, false);
  }

  // Hovering the orange bottom bar leaves all held words in the paper space above it
  function leaveHeldAboveBar() {
    if (!heldItems.length) return;
    dropCooldownUntil = performance.now() + 420;
    while (heldItems.length) {
      dropItem(heldItems.pop(), true);
    }
  }

  // Clicking "Niklas Stoehr" smoothly returns every held & pinned word to its original slot
  function returnAllWordsHome() {
    dropCooldownUntil = performance.now() + 520;
    const origSlots = {};
    $$(".steal-word").forEach((el) => { origSlots[el.dataset.word] = el; });

    const movers = [];
    // Collect currently held items
    while (heldItems.length) {
      const h = heldItems.pop();
      movers.push({ el: h.el, word: h.word, x: h.x, y: h.y });
    }
    // Collect currently pinned items
    for (let i = magnetEls.length - 1; i >= 0; i--) {
      const m = magnetEls[i];
      if (m.isPinned && m.el.isConnected) {
        const r = m.el.getBoundingClientRect();
        m.el.style.transform = "";
        movers.push({ el: m.el, word: m.word, x: r.left, y: r.top });
        magnetEls.splice(i, 1);
      }
    }

    movers.forEach(({ el, word, x, y }) => {
      const slot = origSlots[word];
      if (!slot) { el.remove(); return; }
      const target = slot.getBoundingClientRect();
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      el.classList.add("returning-word");
      // Force layout before animating to original slot
      void el.offsetWidth;
      el.style.left = `${target.left.toFixed(1)}px`;
      el.style.top = `${target.top.toFixed(1)}px`;
      setTimeout(() => {
        el.remove();
        slot.classList.remove("stolen");
      }, 370);
    });
  }

  if (finePointer && stickyWordEl && pinnedLayer) {
    $$(".steal-word").forEach((el) => registerMagnet(el, el.dataset.word, false));

    document.addEventListener("click", (e) => {
      if (activeView !== "home" || !heldItems.length) return;
      if (e.target.closest("a, button")) return;
      dropTopWord();
    });

    const bottomBar = $(".bottom-bar");
    if (bottomBar) {
      bottomBar.addEventListener("pointerenter", () => {
        if (activeView === "home" && heldItems.length) leaveHeldAboveBar();
      });
    }
  }

  function updateLiquidMagnets() {
    if (!finePointer || activeView !== "home" || innerWidth <= 820 || reduced) return;
    const now = performance.now();
    const canGrab = now > dropCooldownUntil;
    const pullRadius = 230; // starts soaking when mouse gets closer
    const snapDist = 18;

    for (let i = magnetEls.length - 1; i >= 0; i--) {
      const m = magnetEls[i];
      if (!m.el.isConnected || m.el.classList.contains("stolen")) continue;

      const r = m.el.getBoundingClientRect();
      const left = r.left - m.tx, right = r.right - m.tx;
      const top = r.top - m.ty, bottom = r.bottom - m.ty;
      const nearX = clamp(mx, left, right);
      const nearY = clamp(my, top, bottom);
      const edgeDx = mx - nearX;
      const edgeDy = my - nearY;
      const edgeDist = Math.hypot(edgeDx, edgeDy);

      // Require mouse to move away from a freshly dropped word before re-grabbing it
      if (m.needsLeave) {
        if (edgeDist > 85) m.needsLeave = false;
        continue;
      }

      if (canGrab && edgeDist <= snapDist && mx > 0) {
        // Capture current visual rect right before detaching so there is zero jump
        const snapRect = { left: r.left, top: r.top };
        m.el.style.transform = "";
        if (m.isPinned) {
          m.el.remove();
          magnetEls.splice(i, 1);
        } else {
          m.el.classList.add("stolen");
        }
        pickUpWord(m.word, snapRect);
        continue;
      }

      // Liquid bubble-soak pull toward the mouse when nearby
      let ttx = 0, tty = 0, tsx = 1, tsy = 1, tsk = 0;
      if (canGrab && edgeDist < pullRadius && mx > 0) {
        const p = 1 - edgeDist / pullRadius;
        const ease = p * p;
        const cxW = (left + right) * 0.5;
        const cyW = (top + bottom) * 0.5;
        const dx = mx - cxW;
        const dy = my - cyW;
        const d = Math.hypot(dx, dy) || 1;
        ttx = (dx / d) * 32 * ease;
        tty = (dy / d) * 26 * ease;
        tsx = 1 + Math.abs(dx / d) * 0.16 * ease;
        tsy = 1 + Math.abs(dy / d) * 0.22 * ease;
        tsk = clamp((dx / 170) * -11 * ease, -12, 12);
      }

      m.tx = lerp(m.tx, ttx, 0.15);
      m.ty = lerp(m.ty, tty, 0.15);
      m.sx = lerp(m.sx, tsx, 0.15);
      m.sy = lerp(m.sy, tsy, 0.15);
      m.sk = lerp(m.sk, tsk, 0.15);

      if (Math.abs(m.tx) > 0.05 || Math.abs(m.ty) > 0.05 || Math.abs(m.sx - 1) > 0.002) {
        m.el.style.transform = `translate3d(${m.tx.toFixed(2)}px, ${m.ty.toFixed(2)}px, 0) scale(${m.sx.toFixed(3)}, ${m.sy.toFixed(3)}) skewX(${m.sk.toFixed(2)}deg)`;
      } else {
        m.el.style.transform = "";
      }
    }

    // Smoothly glide each held word along its exact approach angle
    heldItems.forEach((h) => {
      h.x = lerp(h.x, mx + h.offX, 0.22);
      h.y = lerp(h.y, my + h.offY, 0.22);
      h.pop = lerp(h.pop, 0, 0.14);
      h.el.style.left = `${h.x.toFixed(1)}px`;
      h.el.style.top = `${h.y.toFixed(1)}px`;
      h.el.style.transform = h.pop > 0.005 ? `scale(${(1 + h.pop).toFixed(3)})` : "";
    });
  }

  /* ═════════ 3. PUBLICATIONS + TOLOOK-STYLE DISTORTED HOVER FIGURES ───────── */
  const pubList = $("#pub-list");
  const FIG_IDS = [1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 24];

  if (finePointer) {
    FIG_IDS.forEach((id) => {
      const im = new Image();
      im.src = `assets/figs/f${id}.jpg`;
    });
  }

  function figFor(idx) {
    const id = FIG_IDS.includes(idx) ? idx : FIG_IDS[idx % FIG_IDS.length];
    return `assets/figs/f${id}.jpg`;
  }

  function positionFig(e) {
    if (!finePointer || !floatWrap) return;
    const x = clamp(e.clientX + 14, 10, innerWidth - 400);
    const y = clamp(e.clientY + 12, 56, innerHeight - 360);
    floatWrap.style.left = `${x.toFixed(0)}px`;
    floatWrap.style.top = `${y.toFixed(0)}px`;
  }

  PUBS.forEach((p, idx) => {
    const li = document.createElement("li");
    li.className = "pub-row";

    const authorsHtml = esc(p.a).replace(/Niklas Stoehr/g, "<b>Niklas Stoehr</b>");
    li.innerHTML = `
      <span class="pub-year">${p.y}</span>
      <span class="pub-title-cell"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.t)}</a></span>
      <span class="pub-authors">${authorsHtml}</span>
      <span class="pub-venue">${esc(p.v)}</span>`;

    if (finePointer && floatWrap && floatFig) {
      const src = figFor(idx);
      li.addEventListener("pointerenter", (e) => {
        if (floatFig.getAttribute("src") !== src) floatFig.setAttribute("src", src);
        positionFig(e);
        floatWrap.classList.add("show");
      });
      li.addEventListener("pointermove", positionFig);
      li.addEventListener("pointerleave", hideFig);
    }

    pubList.appendChild(li);
  });

  /* ═════════ 4. CV (TIGHT ONE-LINE LIST, LOCATION & DATES RIGHT-ALIGNED) ───────── */
  const cvWork = $("#cv-work");
  const cvEdu = $("#cv-edu");

  CV.forEach((c) => {
    const li = document.createElement("li");
    li.className = "cv-item";
    const dates = c.from === c.to ? c.from : `${c.from}–${c.to}`;
    li.innerHTML = `
      <span class="cv-org">${esc(c.org)}</span>
      <span class="cv-role">${esc(c.role)}</span>
      <span class="cv-right">${esc(c.place)} · ${esc(dates)}</span>`;

    (c.kind === "work" ? cvWork : cvEdu).appendChild(li);
  });

  /* ═════════ 5. CURSOR: ONE FIXED ORANGE SHAPE PER PAGE ───────── */
  const cursorEl = $("#cursor");
  const cursorPath = $("#cursor-path");
  let mx = -100, my = -100, cx = -100, cy = -100;

  if (finePointer && cursorEl && cursorPath) {
    document.body.classList.add("custom-cursor");

    const N = 60;
    const R0 = 7;
    function polyPoints(sides, rotDeg = 0) {
      const pts = [];
      const rotRad = (rotDeg * Math.PI) / 180;
      if (sides === 0) {
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + rotRad;
          pts.push([Math.cos(a) * R0, Math.sin(a) * R0]);
        }
        return pts;
      }
      const Rc = R0 * (sides === 4 ? 1.18 : 1.08);
      const verts = [];
      for (let v = 0; v < sides; v++) {
        const a = (v / sides) * Math.PI * 2 + rotRad;
        verts.push([Math.cos(a) * Rc, Math.sin(a) * Rc]);
      }
      for (let i = 0; i < N; i++) {
        const pos = (i / N) * sides;
        const idx = Math.floor(pos) % sides;
        const next = (idx + 1) % sides;
        const t = pos - Math.floor(pos);
        pts.push([lerp(verts[idx][0], verts[next][0], t), lerp(verts[idx][1], verts[next][1], t)]);
      }
      return pts;
    }

    const SHAPES = {
      home: polyPoints(0, 0),        // circle
      cv: polyPoints(4, 45),         // square
      publications: polyPoints(6, 0) // hexagon
    };

    let cur = SHAPES.home.map((p) => p.slice());
    let hovering = false, scaleNow = 1;

    addEventListener("pointermove", (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!cursorEl.classList.contains("on")) {
        cx = mx; cy = my;
        cursorEl.classList.add("on");
      }
      hovering = Boolean(e.target.closest("a, button, .pub-row, .steal-word, .pinned-word"));
    });
    document.addEventListener("pointerleave", () => {
      cursorEl.classList.remove("on");
      hideFig();
    });

    function tickCursor() {
      requestAnimationFrame(tickCursor);
      cx = lerp(cx, mx, 0.35);
      cy = lerp(cy, my, 0.35);
      cursorPop = lerp(cursorPop, 0, 0.11);
      const baseScale = hovering ? 1.9 : (heldItems.length ? 1.45 : 1);
      scaleNow = lerp(scaleNow, baseScale + cursorPop, 0.22);

      const target = SHAPES[activeView] || SHAPES.home;
      const k = reduced ? 1 : 0.14;
      let d = "";
      for (let i = 0; i < N; i++) {
        cur[i][0] = lerp(cur[i][0], target[i][0], k);
        cur[i][1] = lerp(cur[i][1], target[i][1], k);
        d += (i === 0 ? "M" : "L") + (cur[i][0] * scaleNow).toFixed(2) + " " + (cur[i][1] * scaleNow).toFixed(2);
      }
      cursorPath.setAttribute("d", d + "Z");
      cursorEl.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;

      updateLiquidMagnets();
    }
    requestAnimationFrame(tickCursor);
  }

  /* ═════════ INIT ROUTE ═════════ */
  const initial = location.hash.replace("#", "") || "home";
  showPage(initial, false);
})();
