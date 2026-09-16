/* John DeSouza — portfolio scripts
   1. CONFIG: the only thing you need to edit. Empty values hide their buttons. */
const CONFIG = {
  linkedin: "https://www.linkedin.com/in/johndesouza-/",
  email: "jdesouza90@gmail.com",
  resume: "/assets/john-desouza-resume.pdf",  // empty hides the "Resume" links
};

/* 2. Everything else. Each feature is one function below; the list at the end
   runs them in order, each on its own, so a feature that throws (a browser
   without some API, a block of markup that moved) leaves the rest working. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Helpers ---- */
  // A colour token from styles.css, as #rrggbb, so the canvas draws in the
  // same ink and accent as the page. The fallback is the token's value today.
  const styles = getComputedStyle(document.documentElement);
  const token = (name, fallback) => {
    const v = styles.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  };
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  // Calls fn on the next frame after anything that can move content on screen
  // (scroll, resize, load, a jump to a hash, the tab coming back), at most once
  // a frame. Returns the throttled call itself, with a .stop() that detaches it.
  const VIEWPORT_EVENTS = ["scroll", "resize", "load", "pageshow", "hashchange"];
  const onViewportChange = (fn) => {
    let queued = false;
    const tick = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(); });
    };
    VIEWPORT_EVENTS.forEach((ev) => window.addEventListener(ev, tick, { passive: true }));
    document.addEventListener("visibilitychange", tick);
    tick.stop = () => {
      VIEWPORT_EVENTS.forEach((ev) => window.removeEventListener(ev, tick));
      document.removeEventListener("visibilitychange", tick);
    };
    return tick;
  };
  // A fresh unlock (initUnlock) holds the page behind its sheet. Work that
  // should not start until the doors part waits here; on any other visit it
  // runs at once. The timer is a backstop: the page must never stay hidden.
  const afterOpener = (fn) => {
    if (!document.documentElement.classList.contains("unlock")) { fn(); return; }
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    document.addEventListener("unlock:open", go, { once: true });
    setTimeout(go, 6000);
  };

  /* ---- Unlock opener ----
     The gate answers a correct password by sending the reader to the case
     study with ?unlocked, and the head's one-line script has already set
     html.unlock so nothing paints before the sheet. The sheet is the
     project's own ground split by one green seam: the seam draws, the title
     rises, then the seam becomes two edges and the halves part like doors
     while the hero rises in behind them (the reveal and the hero's cascade
     both wait on "unlock:open"). It plays once: the param is dropped from
     the address as it starts, so a refresh or a shared link never replays
     it. A click on the sheet or Escape jumps to the end. */
  const initUnlock = () => {
    const root = document.documentElement;
    const h1 = $(".cs-hero h1");
    const wanted = /[?&]unlocked(?=&|$)/.test(location.search);
    if (!wanted || !h1) { root.classList.remove("unlock"); return; }
    root.classList.add("unlock");                        // a cached page without the head script still gets the sheet
    try {
      const clean = location.search.replace(/[?&]unlocked(?=&|$)/, "").replace(/^&/, "?");
      history.replaceState(history.state, "", location.pathname + clean + location.hash);
    } catch (_) {}

    const EASE = "cubic-bezier(.23, 1, .32, 1)", EASE_IO = "cubic-bezier(.77, 0, .175, 1)";
    const make = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; };
    const sheet = make("div", "opener");
    sheet.setAttribute("role", "status");
    const left = make("div", "opener-half l"), right = make("div", "opener-half r"), seam = make("span", "opener-seam");
    const body = make("div", "opener-body");
    const eyebrow = make("p", "eyebrow", "Unlocked");
    const title = make("p", "t-display", h1.textContent.trim());
    const note = make("p", "t-small opener-note", "Thanks for the password. The numbers in here aren't public, so please keep them between us.");
    body.append(eyebrow, title, note);
    sheet.append(left, right, seam, body);
    document.body.appendChild(sheet);
    root.classList.add("unlock-on");                     // the page shows under the sheet from here

    let opened = false, finished = false;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const open = () => {                                 // the doors part: the page starts
      if (opened) return;
      opened = true;
      root.classList.remove("unlock");
      document.dispatchEvent(new CustomEvent("unlock:open"));
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      sheet.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      sheet.remove();
      open();
      root.classList.remove("unlock-on");
    };
    sheet.addEventListener("click", finish);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") finish(); });

    if (reduced) { at(1400, finish); return; }           // the sheet shows still, then goes
    const rise = (el, delay) => el.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 600, delay, easing: EASE, fill: "both" });
    seam.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 500, easing: EASE, fill: "both" });
    rise(eyebrow, 220); rise(title, 320); rise(note, 460);
    at(1600, () => body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE, fill: "forwards" }));
    at(1780, () => {
      sheet.classList.add("part");                       // the seam becomes the two door edges
      seam.style.opacity = "0";
      left.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], { duration: 850, easing: EASE_IO, fill: "forwards" });
      right.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], { duration: 850, easing: EASE_IO, fill: "forwards" });
    });
    at(1980, open);
    at(2640, finish);
  };

  /* ---- Links from CONFIG ---- */
  const initLinks = () => {
    $$("[data-link]").forEach((el) => {
      const key = el.dataset.link;
      const val = CONFIG[key];
      if (!val) { (el.closest("li") || el).hidden = true; return; }
      el.href = key === "email" ? `mailto:${val}` : val;
      if (key === "resume") { el.download = "John_DeSouza_Resume.pdf"; return; }
      if (key !== "email") { el.target = "_blank"; el.rel = "noopener"; }
    });
  };

  /* ---- Nav ----
     The phone menu is a disclosure: the button reports its state, Escape
     closes it and hands focus back, and following a link closes it. */
  const initNav = () => {
    const nav = $(".nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const toggle = $(".nav-toggle");
    if (!toggle) return;
    let lockY = 0;
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) {
        lockY = window.scrollY;
        document.body.style.top = `-${lockY}px`;
        document.body.classList.add("nav-locked");
      } else {
        document.body.classList.remove("nav-locked");
        document.body.style.top = "";
        window.scrollTo(0, lockY);
      }
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    // A tap on the scrim (the nav's own ::before, so the event lands on the nav) closes it.
    nav.addEventListener("click", (e) => { if (e.target === nav && nav.classList.contains("open")) setOpen(false); });
    nav.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !nav.classList.contains("open")) return;
      setOpen(false);
      toggle.focus();
    });
    $$(".nav-links a", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
  };

  /* ---- Scroll reveal ----
     Content is visible by default. JS opts into the animation by marking the
     document, so a failed, blocked or throttled script can never hide a section.
     A failsafe drops the animation if nothing has revealed after 2.5s.

     Every major block is tagged so sections rise in: anything already marked
     keeps its tag, otherwise each direct child of a section gets one. A block
     reveals once its top crosses a line 70% down the viewport, so the move
     happens where the reader is looking rather than at the bottom edge; the
     line drops to the bottom edge as the page runs out of scroll, so the last
     blocks never wait for room that isn't there. Blocks that cross together
     follow each other 60ms apart, in document order. */
  const initReveal = () => {
    $$("main > section").forEach((section) => {
      const host = section.querySelector(":scope > .wrap") || section;
      const kids = Array.from(host.children).filter((k) => k.nodeType === 1);
      const list = kids.length ? kids : [section];
      list.forEach((el) => {
        if (el.closest("[data-reveal]") && el.closest("[data-reveal]") !== el) return;
        if (el.querySelector("[data-reveal]")) return;   // its children rise on their own
        if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
      });
    });

    const revealEls = $$("[data-reveal]");
    const LINE = 0.7;
    if (reduced || !("IntersectionObserver" in window) || !revealEls.length) return;
    document.documentElement.classList.add("anim");
    afterOpener(() => revealOnScroll(revealEls, LINE));  // after a fresh unlock, the first screen rises as the doors part
  };
  // The observer, its backstop and its failsafe. Split from initReveal only so
  // a fresh unlock can hold all three until the opener's doors part.
  const revealOnScroll = (revealEls, LINE) => {
    // Everything shown in one pass is one batch; the stagger counts within it.
    // The batch settles on a microtask (not a frame: frames stop in a background
    // tab, and the failsafe below would fire first).
    let batch = [];
    const queued = new WeakSet();
    const show = (el) => {
      if (queued.has(el)) return;
      queued.add(el);
      if (!batch.length) queueMicrotask(() => {
        batch.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        batch.forEach((n, i) => {
          n.style.setProperty("--reveal-i", String(Math.min(i, 4)));
          n.classList.add("in");
          n.dispatchEvent(new CustomEvent("reveal", { bubbles: true }));
        });
        batch = [];
      });
      batch.push(el);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { rootMargin: `0px 0px -${Math.round((1 - LINE) * 100)}% 0px`, threshold: 0 });
    revealEls.forEach((el) => io.observe(el));

    // Backstop for the observer. It measures only the elements still hidden and
    // detaches itself once they have all been revealed, so a long page is not
    // paying for a full measure pass on every scroll tick for the rest of the visit.
    // On first paint the whole viewport counts (nothing on the first screen
    // should wait for a scroll); after that the line applies.
    let pending = revealEls.slice();
    const sweep = (firstPaint) => {
      if (!pending.length) return;
      const vh = window.innerHeight;
      const room = Math.max(0, document.documentElement.scrollHeight - vh - window.scrollY);
      const line = firstPaint ? vh : vh - Math.min(vh * (1 - LINE), room);
      const still = [];
      for (const el of pending) {
        if (el.classList.contains("in")) continue;
        const r = el.getBoundingClientRect();
        if (r.top < line && r.bottom > 0) { show(el); io.unobserve(el); }
        else still.push(el);
      }
      pending = still;
      if (!pending.length) { move.stop(); io.disconnect(); }
    };
    const move = onViewportChange(() => sweep(false));
    sweep(true);
    setTimeout(() => sweep(true), 400);
    // Failsafe: if nothing ever revealed, the observer is broken - drop the
    // animation entirely so content is visible. Never blanket-reveal, or
    // everything below the fold is already shown before you scroll to it.
    setTimeout(() => {
      if (!revealEls.some((el) => el.classList.contains("in"))) {
        document.documentElement.classList.remove("anim");
      }
    }, 2500);
  };

  /* ---- Once in view ----
     Fires the callback once, when the element is on screen. The observer does
     the work; a scroll and resize sweep backs it up; and the timer only steps
     in for an element that is already in view but never fired (a blocked
     observer), never for one the reader simply hasn't scrolled to yet, so a
     block below the fold still animates however long it takes to reach it.
     The callback gets true when it can animate and false when it should just
     settle. Elements already on screen fire on the next frame. An element
     inside a block that reveals on scroll also waits for that block's reveal
     (the "reveal" event), so nothing draws while its block is still hidden. */
  const onceInView = (el, threshold, cb, fallbackMs = 4000) => {
    let done = false, io = null, timer = 0;
    const block = el.closest("[data-reveal]");
    const revealed = () => !block || block.classList.contains("in") || !document.documentElement.classList.contains("anim");
    const inView = () => {
      const r = el.getBoundingClientRect(), edge = r.height * threshold;
      return r.top + edge <= window.innerHeight && r.bottom - edge >= 0;
    };
    const fire = (animate) => {
      if (done) return;
      done = true;
      if (io) io.disconnect();
      clearTimeout(timer);
      move.stop();
      document.removeEventListener("reveal", move);
      cb(animate);
    };
    const move = onViewportChange(() => { if (!done && revealed() && inView()) fire(true); });
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting && revealed()) fire(true); }, { threshold });
      io.observe(el);
    }
    document.addEventListener("reveal", move);
    move();
    // Stuck in view with nothing pending: settle. Still waiting on the block's
    // reveal (it sits below the line): check again later rather than settle.
    const stuck = () => {
      if (done || !inView()) return;
      if (revealed()) fire(false); else timer = setTimeout(stuck, fallbackMs);
    };
    timer = setTimeout(stuck, fallbackMs);
  };

  /* ---- Tabs: the three tracking layers ----
     Standard tablist keyboarding (arrows, Home, End; selection follows focus).
     The underline is one element positioned from the selected tab's box, so
     it slides rather than blinks; it is re-measured on resize and once the
     web fonts land, since both change tab widths. */
  const initTabs = () => $$("[data-tabs]").forEach((root) => {
    const list = $('[role="tablist"]', root);
    const tabs = $$('[role="tab"]', root);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    const rings = $$("[data-ring]", root);   // Figure A: the ring for the selected tab lights up
    if (!list || !tabs.length) return;
    let current = Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"));
    const place = () => {
      const t = tabs[current];
      list.style.setProperty("--tab-x", `${t.offsetLeft}px`);
      list.style.setProperty("--tab-y", `${t.offsetTop + t.offsetHeight - 2}px`);
      list.style.setProperty("--tab-w", String(t.offsetWidth));   // unitless: the track is 1px wide and scaled
      // on a phone the strip scrolls, so the selected tab is brought into view
      if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, behavior: "smooth" });
    };
    const select = (i, focus) => {
      current = i;
      root.classList.toggle("instant", Boolean(focus));   // keyboard moves repeat; they don't animate
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        // the hidden panels fade for .22s; keeping them out of the tab order
        // means a quick Tab after an arrow key can't land on one mid-fade
        if (panels[k]) { panels[k].classList.toggle("active", on); panels[k].tabIndex = on ? 0 : -1; }
      });
      rings.forEach((r) => r.classList.toggle("on", Number(r.dataset.ring) === i));
      place();
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        const n = tabs.length;
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select((next + n) % n, true);
      });
    });
    // Figure A answers the pointer as well: a click inside a ring picks its
    // tab (the innermost ring wins where they overlap) and the ring under the
    // pointer darkens. The hit test is the circle, not its box, so the corner
    // of an inner ring's box never steals the band around it.
    const nest = rings.length ? rings[0].parentElement : null;
    if (nest) {
      const ringAt = (e) => rings.filter((r) => {
        const b = r.getBoundingClientRect();
        return Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) <= b.width / 2;
      }).pop();   // rings are in DOM order outer to inner; the last hit is the smallest
      const hover = (r) => { rings.forEach((x) => x.classList.toggle("hover", x === r)); nest.style.cursor = r ? "pointer" : ""; };
      nest.addEventListener("pointermove", (e) => hover(ringAt(e)));
      nest.addEventListener("pointerleave", () => hover(null));
      nest.addEventListener("click", (e) => { const r = ringAt(e); if (r) select(Number(r.dataset.ring)); });
    }
    select(current);
    window.addEventListener("resize", place, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  });

  /* ---- Testimonial carousel ----
     Auto-advances every few seconds while it's on screen, the tab is visible
     and focus isn't inside it. It runs under reduced motion too (the slides
     cross-fade, they don't move; the CSS drops the fade there). The pause
     button is the WCAG 2.2.2 stop, and the track only announces slides while
     paused so a screen reader isn't interrupted by the timer. */
  const initCarousels = () => $$("[data-carousel]").forEach((c) => {
    const track = $(".testimonial-track", c);
    const slides = $$(".testimonial", c);
    const prev = $(".prev", c), next = $(".next", c), pause = $(".pause", c);
    const dots = $$(".dot", c);
    if (slides.length < 2 || !track) return;
    const DELAY = 7000;
    let i = 0, timer = null, playing = true, focus = false, seen = true;

    const show = (k) => {
      i = (k + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle("active", n === i));
      dots.forEach((d, n) => d.setAttribute("aria-current", n === i ? "true" : "false"));
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const sync = () => {
      const run = playing && !focus && seen && !document.hidden;
      if (run && !timer) timer = setInterval(() => show(i + 1), DELAY);
      if (!run) stop();
      track.setAttribute("aria-live", playing ? "off" : "polite");
      if (pause) {
        pause.setAttribute("aria-pressed", String(!playing));
        pause.setAttribute("aria-label", playing ? "Pause rotation" : "Resume rotation");
      }
    };
    const nudge = (k) => { show(k); if (timer) { stop(); sync(); } };   // restart the clock after a manual move

    prev && prev.addEventListener("click", () => nudge(i - 1));
    next && next.addEventListener("click", () => nudge(i + 1));
    dots.forEach((d, n) => d.addEventListener("click", () => nudge(n)));
    // resuming from the button is explicit, so focus sitting on it shouldn't re-pause
    pause && pause.addEventListener("click", () => { playing = !playing; focus = false; sync(); });
    c.addEventListener("keydown", (e) => {
      if (e.target.closest(".dots") === null) return;
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      nudge(i + d);
      dots[i].focus();
    });
    c.addEventListener("focusin", () => { focus = true; sync(); });
    c.addEventListener("focusout", (e) => { if (!c.contains(e.relatedTarget)) { focus = false; sync(); } });
    document.addEventListener("visibilitychange", sync);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([en]) => { seen = en.isIntersecting; sync(); }, { threshold: .25 }).observe(c);
    }
    show(0);
    sync();
  });

  /* ---- Walkthrough animations: poster first, animate on demand ---- */
  const initWalkthroughs = () => $$(".walk").forEach((w) => {
    const img = $("img", w), btn = $(".play", w);
    if (!img || !btn) return;
    btn.addEventListener("click", () => {
      if (btn.dataset.busy) return;
      // These animations are several megabytes; hold the control in a loading
      // state until the frames are actually decoded, rather than hiding it
      // immediately and leaving the poster sitting there with no explanation.
      btn.dataset.busy = "1";
      w.classList.add("loading");
      btn.setAttribute("aria-busy", "true");
      const next = new Image();
      const start = () => {
        img.src = img.dataset.anim;
        w.classList.remove("loading");
        w.classList.add("playing");        // fades the scrim with the control
        btn.classList.add("playing");
        btn.setAttribute("aria-pressed", "true");
        btn.removeAttribute("aria-busy");
      };
      next.onload = start;
      next.onerror = () => {               // never strand the poster with no control
        w.classList.remove("loading");
        btn.removeAttribute("aria-busy");
        delete btn.dataset.busy;
      };
      next.src = img.dataset.anim;
    });
  });

  /* ---- AI card: the strands, in three dimensions ----
     Eighty-odd strands lie on a horn that narrows to a single line. The horn
     turns slowly about its axis and breathes in perspective, and every strand
     sways on its own. It draws only while the card is on screen and the tab
     is visible, never under reduced motion (the still SVG stays), and the
     button in the corner is the WCAG 2.2.2 stop. */
  const initStrands = () => $$("[data-strands]").forEach((fig) => {
    const c = $("canvas", fig), btn = $(".art-ctl", fig);
    const ctx = c && c.getContext && c.getContext("2d");
    if (reduced || !ctx) return;
    const N = 88, M = 48, X0 = -2, XM = .55, D = 3.2;   // strands, points each, start x, merge x, camera distance
    let seed = 20260914;                                 // same strands every visit
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const r = (a, b) => a + (b - a) * rnd();
    const sm = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
    const strands = [];
    for (let i = 0; i < N; i++) strands.push({ phi: (i / N) * Math.PI * 2 + r(-.1, .1), r0: r(.55, 1), amp: r(.05, .16), lam: r(1.4, 3), p1: r(0, 6.28), p2: r(0, 6.28), sp: r(.5, 1.1), w: r(.6, 1.2), set: r(.004, .03) });
    const green = { phi: 2.1, r0: .78, amp: .09, lam: 1.9, p1: 1.2, p2: 3.1, sp: .8, w: 2.2, set: 0 };
    const axis = { phi: 0, r0: 0, amp: 0, lam: 1, p1: 0, p2: 0, sp: 1, set: 0 };
    // the page's own ink and accent, so the strands match the type and the green line the links
    const accent = token("--accent", "#3B6B44");
    const inkRgb = token("--ink", "#14100C").match(/\w\w/g).map((h) => parseInt(h, 16)).join(",");
    const ink = (alpha) => `rgba(${inkRgb},${alpha})`;

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = fig.clientWidth; H = fig.clientHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    };

    // a point on strand k at world x, time t: spin about the axis, yaw toward the camera, a touch of tilt, then project
    const o = [0, 0, 0];
    const point = (k, x, t, rot) => {
      const s = sm((x + 1.15) / (XM + 1.15)), fade = 1 - s;
      const R = k.set + k.r0 * Math.pow(fade, .9) + k.amp * fade * Math.sin(k.lam * 1.7 * x + k.p2 + t * k.sp * .8);
      const a = k.phi + k.amp * 3 * fade * Math.sin(k.lam * x + k.p1 + t * k.sp);
      const y = R * Math.cos(a), z = R * Math.sin(a);
      const y1 = y * rot.cx - z * rot.sx, z1 = y * rot.sx + z * rot.cx;
      const x2 = x * rot.cy + z1 * rot.sy, z2 = -x * rot.sy + z1 * rot.cy;
      const x3 = x2 * rot.cz - y1 * rot.sz, y3 = x2 * rot.sz + y1 * rot.cz;
      const p = D / (D - z2);
      o[0] = W / 2 + rot.S * x3 * p; o[1] = H / 2 - rot.S * y3 * p; o[2] = z2;
    };
    const trace = (k, t, rot, to, n) => {
      ctx.beginPath();
      let zn = 0;
      for (let j = 0; j <= n; j++) {
        point(k, X0 + (to - X0) * j / n, t, rot);
        if (j === 8) zn = o[2];                  // depth at the mouth sets weight and tone
        j ? ctx.lineTo(o[0], o[1]) : ctx.moveTo(o[0], o[1]);
      }
      return Math.min(1, Math.max(0, (zn + 1) / 2));
    };
    const frame = (t) => {
      const tx = t * .13, ty = .25 + .3 * Math.sin(t * .05), tz = -.06;
      const rot = { cx: Math.cos(tx), sx: Math.sin(tx), cy: Math.cos(ty), sy: Math.sin(ty), cz: Math.cos(tz), sz: Math.sin(tz), S: Math.max(W / 2.3, H / 2) };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      point(axis, XM, t, rot);                    // where the strands resolve, on screen, sets the fade
      const g = ctx.createLinearGradient(0, 0, o[0] - W * .01, 0);
      g.addColorStop(0, ink(1)); g.addColorStop(.55, ink(.8)); g.addColorStop(1, ink(0));
      ctx.strokeStyle = g;
      for (const k of strands) {
        const zn = trace(k, t, rot, XM + .3, M);
        ctx.globalAlpha = .08 + .22 * zn;
        ctx.lineWidth = k.w * (.7 + .6 * zn);
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = green.w;
      trace(green, t, rot, 1.4, M + 16);          // the one that keeps going
      ctx.stroke();
    };

    // the clock only runs while drawing, so a pause freezes the scene and resume picks it up
    let raf = 0, acc = 0, since = 0, playing = true, seen = true;
    const tick = (now) => { frame(acc + (now - since) / 1000); raf = requestAnimationFrame(tick); };
    const sync = () => {
      const run = playing && seen && !document.hidden;
      if (run && !raf) { since = performance.now(); raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; acc += (performance.now() - since) / 1000; }
      if (btn) {
        btn.setAttribute("aria-pressed", String(!playing));
        btn.setAttribute("aria-label", playing ? "Pause animation" : "Resume animation");
      }
    };
    size();
    fig.classList.add("live");
    frame(0);
    if (btn) { btn.hidden = false; btn.addEventListener("click", () => { playing = !playing; sync(); }); }
    if ("ResizeObserver" in window) new ResizeObserver(() => { size(); frame(acc + (raf ? (performance.now() - since) / 1000 : 0)); }).observe(fig);
    else window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", sync);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([en]) => { seen = en.isIntersecting; sync(); }, { threshold: .05 }).observe(fig);
    }
    sync();
  });

  /* ---- Fields ----
     A block's ground as a canvas that answers the cursor: `data-field` on the
     block names which piece runs over its `canvas.field`. Two pieces: the
     dots under the hero and the rings under Get in touch. Both share one
     runner: the pointer is read on the document (the copy never blocks
     it), ignored over links and controls, and its push fades out within a
     second of the cursor resting, so the field only stirs when the reader
     moves. A tap or click drops a ripple. The loop draws at 30fps while
     nothing is happening and 60 while the cursor is in play, only while the
     block is on screen, and stops under the block's pause button if it has
     one; a piece whose rest is still (the rings) reports it and is not
     redrawn until something moves. Under reduced motion each piece draws one
     still frame. The runner and the dots are adapted from ramp.com's hero,
     whose measured values are the defaults. Four other hero pieces (ruled
     lines, waves, contours, a fluid wash) were built and set aside on Sep 15,
     2026; branch hero-backgrounds up to ca9775b has them. */
  const fields = {
    // A grid of ink circles breathing on three slow waves: a 24px grid of 4px
    // rounds, so it reads as a grid rather than ramp.com's 12px texture. The
    // cursor pushes the ones within reach, they spring home, and one in
    // motion turns green. A drifter, a soft taupe blob, wanders the field on
    // its own and pushes the dots the way the cursor does; when the cursor
    // comes over it, it snaps to the cursor and follows until the cursor
    // leaves the block, then drifts on from wherever it is.
    // The copy sits on quieter paper: dots thin to a third of their strength
    // under the box the statement and its buttons occupy, measured from the
    // markup, over a long soft edge.
    dots: ({ ctx, el, ink, accent, colour }) => {
      const S = 24, DOT = 2, R = 150, F = 10, K = .018, DAMP = .8;   // pitch, radius, push radius, push force, spring, damping
      const BR = 260, BA = .4, BPUSH = 210, BF = .7, BSNAP = .8;     // drifter: radius, tint, push radius, push force vs the cursor's, snap reach as a share of the radius
      const taupe = colour("--hair-2", "#CFC9BF").join(",");
      const RS = 420, RW = 500, RF = 10, RD = 2.2;          // ripple: px/s, ring width, force, decay
      const A = .25, MOVED = 1.2;                           // strength on paper (John: 25%, light), px of travel that turns a dot green
      const PAD = 16, FEATHER = 220, UNDER = .35;           // the copy's margin, the run of the fade around it, the dots' strength under the copy (ramp.com: .35 to 1 over the top 45%)
      let W = 0, H = 0, n = 0, hx, hy, ox, oy, vx, vy, k, hf, sprites, sw = 0, energy = 0, hush = "", frames = 0, now = 0;
      const blob = { x: -1, y: -1, speed: 0, held: false };
      // where the drifter wants to be: a slow figure that never repeats exactly
      const roam = (t) => [W * (.5 + .3 * Math.sin(t * .11 + 1.3) + .07 * Math.sin(t * .37)), H * (.52 + .28 * Math.sin(t * .083 + .4) + .06 * Math.cos(t * .29))];
      const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
      const sprite = (colour, dpr) => {
        const r = DOT, d = Math.ceil(r * 2 * dpr) + 2, s = document.createElement("canvas");
        s.width = s.height = d;
        const g = s.getContext("2d");
        g.fillStyle = colour; g.beginPath(); g.arc(d / 2, d / 2, r * dpr, 0, Math.PI * 2); g.fill();
        sw = d / dpr;
        return s;
      };
      const resize = (w, h, dpr) => {
        W = w; H = h;
        const x0 = (W % S) / 2 + S / 2, y0 = (H % S) / 2 + S / 2;
        const cols = Math.ceil((W + S - x0) / S), rows = Math.ceil((H + S - y0) / S);
        n = cols * rows;
        hx = new Float32Array(n); hy = new Float32Array(n); k = new Float32Array(n);
        ox = new Float32Array(n); oy = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
        for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
          hx[i] = x0 + c * S; hy[i] = y0 + r * S; k[i] = K * (.8 + hash(c * 1.7 + r * 73) * .4);
        }
        sprites = [sprite(ink(1), dpr), sprite(accent, dpr)];
        hf = new Float32Array(n).fill(1); hush = "";
        clear();
        if (!blob.held) [blob.x, blob.y] = roam(now);
      };
      // the box the copy occupies, in the block's pixels; each dot's share of the field from its distance to it.
      // Text is measured by its line boxes and a row of buttons by the buttons, since the blocks themselves span the wrap.
      const clear = () => {
        const kids = el.querySelectorAll(":scope > .wrap > *");
        if (!kids.length) return;
        const h = el.getBoundingClientRect(), range = document.createRange();
        let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
        const add = (q) => { if (!q.width) return; l = Math.min(l, q.left - h.left); t = Math.min(t, q.top - h.top); r = Math.max(r, q.right - h.left); b = Math.max(b, q.bottom - h.top); };
        kids.forEach((kid) => {
          if (getComputedStyle(kid).display === "flex") Array.from(kid.children).forEach((c) => add(c.getBoundingClientRect()));
          else { range.selectNodeContents(kid); add(range.getBoundingClientRect()); }
        });
        if (r < l) return;
        const key = [l, t, r, b].map(Math.round).join();
        if (key === hush) return;
        hush = key; l -= PAD; t -= PAD; r += PAD; b += PAD;
        for (let i = 0; i < n; i++) {
          const dx = Math.max(l - hx[i], 0, hx[i] - r), dy = Math.max(t - hy[i], 0, hy[i] - b), d = Math.sqrt(dx * dx + dy * dy);
          const u = d < FEATHER ? d / FEATHER : 1;
          hf[i] = UNDER + (1 - UNDER) * u * u * (3 - 2 * u);
        }
      };
      // the cursor and the drifter push the same way: a square falloff to their reach, scaled by how alive each is
      const pushers = [{ x: 0, y: 0, r: R, f: F, a: 0 }, { x: 0, y: 0, r: BPUSH, f: F * BF, a: 0 }];
      const step = (p) => {
        const rips = p.ripples, nr = rips.length, live = pushers.filter((q) => q.a > .001), np = live.length;
        let e = 0;
        for (let i = 0; i < n; i++) {
          let x = ox[i], y = oy[i], u = vx[i] - x * k[i], v = vy[i] - y * k[i];
          for (let j = 0; j < np; j++) {
            const q = live[j], cx = hx[i] + x - q.x, cy = hy[i] + y - q.y, d2 = cx * cx + cy * cy;
            if (d2 < q.r * q.r && d2 > .01) { const d = Math.sqrt(d2), w = 1 - d / q.r, f = w * w * q.f * q.a / d; u += cx * f; v += cy * f; }
          }
          for (let r = 0; r < nr; r++) {
            const rp = rips[r], cx = hx[i] + x - rp.x, cy = hy[i] + y - rp.y, d = Math.sqrt(cx * cx + cy * cy), diff = d - rp.age * RS;
            if (diff > 60 || diff < -60 || d < .01) continue;
            const f = Math.exp(-diff * diff / RW) * Math.exp(-rp.age * RD) * RF / d;
            u += cx * f; v += cy * f;
          }
          u *= DAMP; v *= DAMP; x += u; y += v;
          ox[i] = x; oy[i] = y; vx[i] = u; vy[i] = v;
          e += u * u + v * v;
        }
        energy = e;
      };
      const frame = (t, dt, p, live) => {
        now = t;
        if (live) {
          // the drifter: snaps to a cursor that reaches it, follows it while the cursor is in the block, roams otherwise
          if (p.inside && Math.hypot(p.x - blob.x, p.y - blob.y) < BR * BSNAP) blob.held = true;
          if (!p.inside) blob.held = false;
          const [tx, ty] = blob.held ? [p.x, p.y] : roam(t), ease = 1 - Math.exp(-dt / (blob.held ? .07 : 1.1));
          const nx = blob.x + (tx - blob.x) * ease, ny = blob.y + (ty - blob.y) * ease;
          blob.speed = dt > 0 ? Math.hypot(nx - blob.x, ny - blob.y) / dt : 0;
          blob.x = nx; blob.y = ny;
          pushers[0].x = p.x; pushers[0].y = p.y; pushers[0].a = p.active;
          pushers[1].x = blob.x; pushers[1].y = blob.y; pushers[1].a = Math.min(1, blob.speed / 40);   // a resting drifter lets the dots settle
          if (p.active > .001 || pushers[1].a > .001 || p.ripples.length || energy > 1e-3) {
            for (let s = Math.max(1, Math.min(3, Math.round(dt * 60))); s > 0; s--) step(p);
          }
        }
        if (++frames % 30 === 0) clear();                 // the copy reflows with fonts and the rise; keep up without measuring every frame
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, BR);
        g.addColorStop(0, `rgba(${taupe},${BA})`); g.addColorStop(.5, `rgba(${taupe},${BA * .45})`); g.addColorStop(1, `rgba(${taupe},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(blob.x - BR, blob.y - BR, BR * 2, BR * 2);
        const h = sw / 2;
        for (let i = 0; i < n; i++) {
          const x = hx[i], y = hy[i];
          let a = .6;
          if (live) {
            const fl = (Math.sin(x * .018 + y * .009 + t * .55) + Math.sin(y * .016 - x * .012 + t * .38) + Math.sin(x * .006 - y * .014 + t * .22)) / 3;
            a = .35 + .65 * (.5 + .5 * fl);
          }
          ctx.globalAlpha = a * A * hf[i];
          ctx.drawImage(sprites[Math.abs(ox[i]) + Math.abs(oy[i]) > MOVED ? 1 : 0], x + ox[i] - h, y + oy[i] - h, sw, sw);
        }
        ctx.globalAlpha = 1;
      };
      return { resize, frame };
    },

    // Rings: the contact band's own ground, paper hairlines rippling out from
    // behind the buttons, drawn to the same pitch and tone as the stylesheet
    // so the band at rest is the design. While the cursor is over the band
    // the rings travel outward and brighten around it, and the ones near it
    // bulge away; a click sends a wave through them. Reports when it is
    // still, so the runner leaves it alone until the next move.
    rings: ({ ctx, el, paper }) => {
      const PITCH = 42, ALPHA = .07, SPEED = 22, SIG = 130, AMP = 22, RING = 16, LIFT = .14;   // px, tone, travel px/s, lens radius, lens lift, ripple lift, tone lift
      const RS = 420, RW = 500, RD = 2.2;
      let W = 0, H = 0, ox = 0, oy = 0, R = 0, phase = 0, speed = 0;
      const resize = (w, h) => {
        W = w; H = h;
        const o = getComputedStyle(el).getPropertyValue("--contact-origin").trim().split(/\s+/).map((v) => parseFloat(v) / 100);
        ox = W * (isNaN(o[0]) ? 1 : o[0]); oy = H * (isNaN(o[1]) ? .5 : o[1]);
        R = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy));
      };
      const frame = (t, dt, p, live) => {
        if (live) { speed += ((p.inside ? SPEED : 0) - speed) * Math.min(1, dt * 3); phase = (phase + speed * dt) % PITCH; }
        const lens = live ? p.active : 0, rips = p.ripples, nr = rips.length;
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1;
        if (lens > 0) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 260);
          g.addColorStop(0, paper(ALPHA + LIFT * lens)); g.addColorStop(1, paper(ALPHA));
          ctx.strokeStyle = g;
        } else ctx.strokeStyle = paper(ALPHA);
        const bend = lens > 0 || nr > 0, s2 = 2 * SIG * SIG, lift = AMP * lens * 1.65 / SIG;
        ctx.beginPath();
        for (let r = phase; r < R; r += PITCH) {
          if (!bend) { ctx.moveTo(ox + r, oy); ctx.arc(ox, oy, r, 0, Math.PI * 2); continue; }
          const n = Math.max(24, Math.min(400, Math.round(r / 2.5)));
          let pen = false;
          for (let i = 0; i <= n; i++) {
            const a = i / n * Math.PI * 2;
            let x = ox + r * Math.cos(a), y = oy + r * Math.sin(a);
            if (x < -40 || x > W + 40 || y < -40 || y > H + 40) { pen = false; continue; }   // the part of the ring off the band
            if (lift > 0) { const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy; if (d2 < s2 * 6) { const f = lift * Math.exp(-d2 / s2); x += dx * f; y += dy * f; } }
            for (let k = 0; k < nr; k++) {
              const rp = rips[k], dx = x - rp.x, dy = y - rp.y, d = Math.sqrt(dx * dx + dy * dy), diff = d - rp.age * RS;
              if (diff > 60 || diff < -60 || d < .01) continue;
              const f = RING * Math.exp(-diff * diff / RW) * Math.exp(-rp.age * RD) / d;
              x += dx * f; y += dy * f;
            }
            pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            pen = true;
          }
        }
        ctx.stroke();
        return live && (speed > .05 || lens > 0 || nr > 0);
      };
      return { resize, frame };
    },
  };

  const initFields = () => $$("[data-field]").forEach((el) => {
    const c = $("canvas.field", el), btn = $(".art-ctl", el);
    const ctx = c && c.getContext && c.getContext("2d");
    const make = fields[el.dataset.field];
    if (!ctx || !make) return;
    const colour = (name, fallback) => token(name, fallback).match(/\w\w/g).map((h) => parseInt(h, 16));   // a token as [r, g, b]
    const inkRgb = colour("--ink", "#14100C").join(","), paperRgb = colour("--paper", "#F6F4F0").join(",");
    const field = make({ ctx, el, colour, ink: (alpha) => `rgba(${inkRgb},${alpha})`, paper: (alpha) => `rgba(${paperRgb},${alpha})`, accent: token("--accent", "#3B6B44") });

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = el.clientWidth; H = el.clientHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field.resize(W, H, dpr);
    };

    // The pointer, in the el's pixels. `active` is 1 while the cursor moves
    // and dies away within a second of it resting; the pieces scale their
    // response by it, so a resting cursor leaves the field to settle.
    const p = { x: -9999, y: -9999, vx: 0, vy: 0, active: 0, inside: false, ripples: [] };
    let raf = 0, prev = 0, t = 0, fresh = true, playing = true, seen = true, stirring = true;
    const box = { top: 0, left: 0, w: 0, h: 0 };
    const measure = () => { const r = el.getBoundingClientRect(); box.top = r.top; box.left = r.left; box.w = r.width; box.h = r.height; };
    const CONTROLS = "a, button, input, select, textarea, label, [role=button], form";
    let tx = -9999, ty = -9999, on = false, over = false, checked = 0, moved = -1e6, touched = -1e6;
    const move = (e) => {
      if (e.timeStamp - prev > 40) measure();               // a still piece has not measured since its last frame
      const x = e.clientX - box.left, y = e.clientY - box.top;
      p.inside = x >= 0 && y >= 0 && x <= box.w && y <= box.h;
      if (y < -150 || y > box.h + 150) { on = false; return; }
      if (e.timeStamp - checked > 100) { over = e.target instanceof Element && !!e.target.closest(CONTROLS); checked = e.timeStamp; }
      if (over) { on = false; return; }
      tx = x; ty = y; on = true; moved = touched = e.timeStamp;
    };
    const leave = () => { on = false; p.inside = false; };
    const down = (e) => {
      if (!e.isPrimary || over) return;
      if (e.timeStamp - prev > 40) measure();
      const x = e.clientX - box.left, y = e.clientY - box.top;
      if (x < 0 || y < 0 || x > box.w || y > box.h) return;
      p.ripples.push({ x, y, born: e.timeStamp, age: 0 });
      if (p.ripples.length > 6) p.ripples.shift();
      touched = e.timeStamp;
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const busy = on || p.inside || p.ripples.length || now - touched < 2500;
      if (!fresh && !busy && (!stirring || now - prev < 33)) return;   // idle: 30fps is plenty for the breathing, none for a still piece
      const dt = fresh ? 0 : Math.min((now - prev) / 1000, .05);
      fresh = false; prev = now; t += dt;
      measure();
      if (on) {
        const x = p.x, y = p.y;
        if (x < -9000) { p.x = tx; p.y = ty; }              // arriving: start where the cursor is, not off the page
        else { p.x += (tx - x) * .8; p.y += (ty - y) * .8; if (dt > 0) { p.vx += ((p.x - x) / dt - p.vx) * .5; p.vy += ((p.y - y) / dt - p.vy) * .5; } }
      } else { p.vx *= .8; p.vy *= .8; }
      const rest = (now - moved) / 1000, aim = on && rest < 1 ? Math.exp(-7 * rest) : 0;
      p.active += (aim - p.active) * Math.min(1, dt * 14);
      if (p.active < .001) p.active = 0;
      for (const rp of p.ripples) rp.age = (now - rp.born) / 1000;
      p.ripples = p.ripples.filter((rp) => rp.age < 2);
      stirring = field.frame(t, dt, p, true) !== false;
    };
    const sync = () => {
      const run = playing && seen && !document.hidden;
      if (run && !raf) { fresh = true; raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (btn) {
        btn.setAttribute("aria-pressed", String(!playing));
        btn.setAttribute("aria-label", playing ? "Pause animation" : "Resume animation");
      }
    };

    size();
    measure();
    el.classList.add("live");
    if (reduced) {
      field.frame(0, 0, p, false);
      if ("ResizeObserver" in window) new ResizeObserver(() => { size(); field.frame(0, 0, p, false); }).observe(el);
      return;
    }
    field.frame(0, 0, p, true);
    const toggle = () => { playing = !playing; sync(); };
    if (btn) { btn.hidden = false; btn.addEventListener("click", toggle); }
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("visibilitychange", sync);
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); stirring = true; if (!raf) field.frame(t, 0, p, true); }) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", size);
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([en]) => { seen = en.isIntersecting; sync(); }, { threshold: 0 }) : null;
    if (io) io.observe(el);
    sync();
    el.field = { stop() {
      playing = false; sync();
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerdown", down); document.removeEventListener("visibilitychange", sync);
      if (ro) ro.disconnect(); if (io) io.disconnect();
      if (btn) { btn.removeEventListener("click", toggle); btn.hidden = true; }
      ctx.clearRect(0, 0, W, H);
      el.classList.remove("live");
    } };
  });

  /* ---- Originations chart ----
     A line over a soft area, drawn in the pixels of its box so the type stays
     the same size on a phone. The lines are revealed left to right by a
     clip-path sweep when the card scrolls in, and the closing value lands in a
     pill at the right edge as the sweep does. Hovering, touching or arrowing
     through the plot drops a marker on the nearest month with a card of its
     numbers. The grid, the axes and the table below never move. */
  const initCharts = () => $$("[data-chart]").forEach((el) => {
    const data = JSON.parse(el.dataset.series);
    const annos = JSON.parse(el.dataset.annotations || "[]");
    const fmt = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;
    const full = (v) => "$" + v.toLocaleString("en-US");
    const short = (label, k, narrow) => {   // "Oct 2025" reads "Oct ’25" on the axis; a phone
      const [mo, yr] = label.split(" ");     // keeps the year only where it starts or changes
      if (!yr) return label;
      const prev = k > 0 ? data[k - 1].label.split(" ")[1] : null;
      return narrow && prev === yr ? mo : `${mo} ’${yr.slice(-2)}`;
    };
    const ns = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs, parent, text) => {
      const n = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      if (parent) parent.appendChild(n);
      return n;
    };
    const div = (cls, parent, attrs = {}) => {
      const n = document.createElement("div");
      n.className = cls;
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      parent.appendChild(n);
      return n;
    };

    // A shape-preserving curve (Fritsch–Carlson): it bends through every
    // point without ever dipping below a month or overshooting the next.
    const curve = (pts) => {
      const n = pts.length;
      if (n < 2) return "";
      const dx = [], m = [], t = [];
      for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
      t[0] = m[0]; t[n - 1] = m[n - 2];
      for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
      for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
      }
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < n - 1; i++) {
        const h = dx[i] / 3;
        d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
      }
      return d;
    };

    // Scaffold, built once
    const shell = div("chart-shell", el);
    el.insertBefore(shell, el.querySelector("details"));
    const grid = svgEl("svg", { class: "chart-grid", "aria-hidden": "true", focusable: "false" }, shell);
    const lines = div("chart-lines", shell);
    const linesSvg = svgEl("svg", { "aria-hidden": "true", focusable: "false" }, lines);
    const pill = div("chart-pill", shell, { "aria-hidden": "true" });
    const marker = div("chart-marker", shell, { "aria-hidden": "true" });
    const node = div("chart-node", shell, { "aria-hidden": "true" });
    const tip = div("tooltip", shell, { "aria-live": "polite" });
    const hit = div("chart-hit", shell, {
      tabindex: "0", role: "group",
      "aria-label": (el.dataset.label || "Chart") + ". Left and right arrows step through the months.",
    });
    const gradId = "chart-area-" + Math.random().toString(36).slice(2, 7);

    let geo = null;                       // the last drawing's points and margins
    let played = reduced || !("animate" in lines);
    let active = -1;

    // Reading a month: marker, dot and a card of its numbers
    const place = (k) => {
      const { pts, m, ih, W } = geo;
      const p = pts[k], d = data[k];
      const note = annos.find((a) => a.at === k);
      tip.innerHTML = `<b>${d.label}</b><span class="tip-row"><span class="dot"></span>Originations<span class="tip-val">${full(d.value)}</span></span>${note ? `<span class="tip-note">${note.text}</span>` : ""}`;
      marker.style.left = `${p.x}px`;
      node.style.left = `${p.x}px`; node.style.top = `${p.y}px`;
      const tw = tip.offsetWidth || 220, th = tip.offsetHeight || 80;
      const tx = Math.min(Math.max(p.x, tw / 2), W - tw / 2);
      const above = p.y - th - 16;
      tip.style.left = `${tx}px`;
      tip.style.top = `${above >= 0 ? above : Math.min(p.y + 16, m.t + ih - th)}px`;
      [tip, marker, node].forEach((n) => n.classList.add("show"));
      active = k;
    };
    const clear = () => { [tip, marker, node].forEach((n) => n.classList.remove("show")); active = -1; };
    const nearest = (clientX) => {
      const r = hit.getBoundingClientRect();
      const k = Math.round(((clientX - r.left) / r.width) * (data.length - 1));
      return Math.max(0, Math.min(data.length - 1, k));
    };

    const draw = () => {
      const W = shell.clientWidth;
      if (!W) return;
      const narrow = W < 520;
      const H = shell.clientHeight;
      const m = { t: narrow && annos.length > 1 ? 36 : 22, r: 0, b: 34, l: narrow ? 40 : 48 };   // a phone stacks two milestone rows
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const max = Math.max(...data.map((d) => d.value));
      const step = Math.pow(10, Math.floor(Math.log10(max)));
      const top = Math.ceil(max / step) * step;
      const y = (v) => m.t + ih - (v / top) * ih;
      const x = (k) => m.l + (iw * k) / (data.length - 1);
      const pts = data.map((d, k) => ({ x: x(k), y: y(d.value) }));
      geo = { m, iw, ih, pts, W, H };

      [grid, linesSvg].forEach((s) => { s.setAttribute("viewBox", `0 0 ${W} ${H}`); s.setAttribute("width", W); s.setAttribute("height", H); s.innerHTML = ""; });

      // Grid and axes: one dashed rule per step, months along the bottom
      const ticks = top / step;
      for (let g = 0; g <= ticks; g++) {
        const v = step * g, gy = y(v);
        svgEl("line", { class: "grid", x1: m.l, x2: W - m.r, y1: gy, y2: gy }, grid);
        svgEl("text", { class: "axis", x: m.l - 10, y: gy + 4, "text-anchor": "end" }, grid, fmt(v));
      }
      data.forEach((d, k) => {
        const anchor = k === 0 ? "start" : k === data.length - 1 ? "end" : "middle";
        svgEl("text", { class: "axis", x: pts[k].x, y: H - 8, "text-anchor": anchor }, grid, short(d.label, k, narrow));
      });

      // Area and line
      const defs = svgEl("defs", {}, linesSvg);
      const lg = svgEl("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svgEl("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": ".22" }, lg);
      svgEl("stop", { offset: "55%", "stop-color": "var(--accent)", "stop-opacity": ".08" }, lg);
      svgEl("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }, lg);
      const d = curve(pts);
      svgEl("path", { class: "area", d: `${d} L${pts[pts.length - 1].x},${m.t + ih} L${pts[0].x},${m.t + ih} Z`, fill: `url(#${gradId})` }, linesSvg);
      svgEl("path", { class: "line", d }, linesSvg);

      // Milestones ride the sweep with the line
      annos.forEach((a, i) => {
        const ax = pts[a.at].x;
        const right = ax > W / 2;                    // anchor the text so it stays inside the frame
        const ty = narrow ? 10 + (i % 2) * 14 : 10;  // stagger rows on a phone so two notes never collide
        svgEl("line", { class: "anno-line", x1: ax, x2: ax, y1: ty + 6, y2: pts[a.at].y - 10 }, linesSvg);
        svgEl("text", { class: "anno", x: ax + (right ? -6 : 6), y: ty + 4, "text-anchor": right ? "end" : "start" }, linesSvg, a.text);
      });

      // Closing value, on the line at the right edge
      const last = pts[pts.length - 1];
      pill.textContent = fmt(data[data.length - 1].value);
      pill.style.top = `${last.y}px`;

      Object.assign(hit.style, { left: `${m.l}px`, top: `${m.t}px`, width: `${iw}px`, height: `${ih}px` });
      marker.style.top = `${m.t}px`; marker.style.height = `${ih}px`;
      lines.style.clipPath = played ? "" : "inset(0 100% 0 0)";
      if (active >= 0) place(active);
    };

    const play = () => {
      if (played) return;
      played = true;
      lines.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
        { duration: 1400, easing: "cubic-bezier(.19, 1, .22, 1)", fill: "both" })
        .finished.then(() => { lines.style.clipPath = ""; }, () => {});
      pill.animate([{ opacity: 0 }, { opacity: 1 }], { delay: 1300, duration: 300, easing: "ease-out", fill: "both" })
        .finished.then(() => { pill.style.opacity = ""; }, () => {});
    };
    if (!played) {
      pill.style.opacity = "0";
      onceInView(shell, 0.35, (animate) => {
        if (animate) setTimeout(play, 200);          // let the card's own reveal lead
        else { played = true; lines.style.clipPath = ""; pill.style.opacity = ""; }
      });
    }

    hit.addEventListener("pointermove", (e) => place(nearest(e.clientX)));
    hit.addEventListener("pointerdown", (e) => place(nearest(e.clientX)));
    hit.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") clear(); });   // a tap keeps its card
    document.addEventListener("pointerdown", (e) => { if (active >= 0 && !shell.contains(e.target)) clear(); });
    hit.addEventListener("keydown", (e) => {
      const n = data.length;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        place(active < 0 ? (dir > 0 ? 0 : n - 1) : (active + dir + n) % n);
      } else if (e.key === "Home") { e.preventDefault(); place(0); }
      else if (e.key === "End") { e.preventDefault(); place(n - 1); }
      else if (e.key === "Escape") clear();
    });
    hit.addEventListener("blur", clear);

    draw();
    if ("ResizeObserver" in window) {
      let w = shell.clientWidth;
      new ResizeObserver(() => { if (shell.clientWidth !== w) { w = shell.clientWidth; draw(); } }).observe(shell);
    } else {
      window.addEventListener("resize", debounce(draw, 120));
    }
  });

  /* ---- Number flow ----
     A headline stat rolls into place like an odometer: every digit is a
     column of 0 to 9 behind a soft mask, and each column turns once around
     to its digit when the stat comes into view. The rest of the string (a
     currency sign, a unit) stands still. Screen readers get the plain text.
     Under reduced motion the stat is left as it was written. */
  const initFlows = () => {
    const flowEase = CSS.supports?.("animation-timing-function", "linear(0, 1)")
      ? "linear(0, 0.0033 0.2%, 0.0263 2.27%, 0.0896 4.99%, 0.4108 12.34%, 0.5757 16.93%, 0.7011 21.7%, 0.7983 26.68%, 0.8721 31.98%, 0.9258 37.73%, 0.9637 44.19%, 0.9877 51.72%, 0.9992 60.71%, 1 100%)"
      : "cubic-bezier(.23, 1, .32, 1)";
    $$("[data-flow]").forEach((el) => {
      const text = el.textContent.trim();
      if (reduced || !/\d/.test(text) || !("animate" in el)) return;   // "No code" has nothing to roll
      el.textContent = "";
      const sr = document.createElement("span");
      sr.className = "sr-only"; sr.textContent = text;
      el.appendChild(sr);
      const cols = [];
      for (const ch of text) {
        const s = document.createElement("span");
        s.setAttribute("aria-hidden", "true");
        if (/\d/.test(ch)) {
          s.className = "flow-digit";
          const strip = document.createElement("span");
          strip.className = "flow-strip";
          for (let i = 0; i < 20; i++) {
            const n = document.createElement("span");
            n.className = "flow-num"; n.textContent = String(i % 10);
            strip.appendChild(n);
          }
          s.appendChild(strip);
          cols.push({ strip, n: Number(ch) });
        } else {
          s.className = "flow-char"; s.textContent = ch === " " ? "\u00a0" : ch;   // a plain space would collapse in the flex row
        }
        el.appendChild(s);
      }
      el.classList.add("flow-on");
      let done = false;
      const settle = (animate) => {
        if (done) return;
        done = true;
        cols.forEach((c, i) => {
          const end = `translateY(${-(10 + c.n)}em)`;     // one full turn, then the digit
          if (animate) {
            c.strip.animate([{ transform: "translateY(0)" }, { transform: end }],
              { duration: 1100, delay: 200 + i * 45, easing: flowEase, fill: "both" })
              .finished.then(() => { c.strip.style.transform = end; }, () => { c.strip.style.transform = end; });
          } else c.strip.style.transform = end;
        });
      };
      onceInView(el, 0.5, settle);                        // never leave a visible stat reading zero
    });
  };

  /* ---- Swipe strips ----
     On a phone the gallery and three-up hero scroll sideways. A region that
     scrolls has to be reachable from the keyboard, so it gets a tab stop only
     while it actually overflows. */
  const initStrips = () => {
    const strips = $$(".gallery, .hero-panel.three");
    if (!strips.length) return;
    const stops = () => strips.forEach((s) => {
      if (s.scrollWidth > s.clientWidth + 1) {
        s.tabIndex = 0;
        if (s.tagName !== "FIGURE") s.setAttribute("role", "group");
        s.setAttribute("aria-label", "Screens, scroll sideways");
      } else { s.removeAttribute("tabindex"); s.removeAttribute("aria-label"); if (s.tagName !== "FIGURE") s.removeAttribute("role"); }
    });
    stops();
    window.addEventListener("resize", debounce(stops, 120));
    window.addEventListener("load", stops);
  };

  /* ---- About: the portrait stands as tall as the text beside it ----
     Its column is the text's height at the photo's own ratio, so it scales
     with the type instead of the row. CSS falls back to a fixed share of the
     row without this, and the stacked layout under 900px ignores it. */
  const initPortrait = () => {
    const grid = $(".about-grid");
    if (!grid || !("ResizeObserver" in window)) return;
    const text = $(".about-text", grid), img = $(".portrait img", grid);
    if (!text || !img) return;
    const ratio = img.getAttribute("width") / img.getAttribute("height");
    new ResizeObserver(([en]) => grid.style.setProperty("--portrait-w", `${en.contentRect.height * ratio}px`)).observe(text);
  };

  /* ---- Footer year ---- */
  const initYear = () => $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  [initUnlock, initLinks, initNav, initReveal, initTabs, initCarousels, initWalkthroughs, initStrands, initFields, initCharts, initFlows, initStrips, initPortrait, initYear]
    .forEach((init) => { try { init(); } catch (err) { console.error(`main.js: ${init.name} failed`, err); } });
})();
