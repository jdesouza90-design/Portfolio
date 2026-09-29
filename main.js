/* John DeSouza — portfolio scripts
   1. CONFIG: the only thing you need to edit. Empty values hide their buttons. */
const CONFIG = {
  linkedin: "https://www.linkedin.com/in/johndesouza-/",
  email: "jdesouza90@gmail.com",
  resume: "/assets/john-desouza-resume.pdf?v=751c3168",  // empty hides the "Resume" links
};

/* 2. Everything else. Each feature is one function below; the list at the end
   runs them in order, each on its own, so a feature that throws (a browser
   without some API, a block of markup that moved) leaves the rest working. */
(function () {
  document.documentElement.classList.add("js-ok");   // the head script drops html.js if this never runs
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Helpers ---- */
  // Tokens from styles.css, so the scripts draw and move in the page's own
  // values: cssVar reads any token, hex a color as #rrggbb, rgb the same as
  // [r, g, b], tint a color as a function of its alpha. Every fallback is
  // the token's value today, for a stylesheet that failed to load.
  const styles = getComputedStyle(document.documentElement);
  // Read once and kept, since the canvases ask every frame; the theme switch
  // (initTheme) empties the cache and says "themechange", and a tint made
  // here reads the new value on its next call.
  const tokens = new Map();
  const cssVar = (name, fallback) => {
    if (!tokens.has(name)) tokens.set(name, styles.getPropertyValue(name).trim());
    return tokens.get(name) || fallback;
  };
  const hex = (name, fallback) => { const v = cssVar(name, ""); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; };
  const rgb = (name, fallback) => hex(name, fallback).match(/\w\w/g).map((h) => parseInt(h, 16));
  const tint = (name, fallback) => (alpha) => `rgba(${rgb(name, fallback).join(",")},${alpha})`;
  document.addEventListener("themechange", () => tokens.clear());
  const onTheme = (fn) => document.addEventListener("themechange", fn);
  const EASE = cssVar("--ease", "cubic-bezier(.23, 1, .32, 1)");
  const EASE_IN_OUT = cssVar("--ease-in-out", "cubic-bezier(.77, 0, .175, 1)");
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  // Text for matching: lower case, curly quotes folded to straight, so
  // "occ's" finds the post that prints "occ’s".
  const fold = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // A pause button says what it holds: pressed means paused.
  const setPaused = (btn, playing, what) => {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(!playing));
    btn.setAttribute("aria-label", `${playing ? "Pause" : "Resume"} ${what}`);
  };
  // Whether a block should be running: on screen (at least `threshold` of it)
  // with the tab visible. `sync` runs whenever that answer may have changed;
  // the returned function reads it, and its .stop() detaches the watch.
  const whileOnScreen = (el, threshold, sync) => {
    let seen = true;
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([en]) => { seen = en.isIntersecting; sync(); }, { threshold }) : null;
    if (io) io.observe(el);
    document.addEventListener("visibilitychange", sync);
    // Backstop for the observer: iOS Safari has been known to drop an
    // IntersectionObserver callback during a fast flick-scroll, which leaves
    // `seen` stuck false and the block paused on screen with nothing left to
    // wake it. A geometry check on scroll corrects it either way.
    const check = io ? onViewportChange(() => {
      const r = el.getBoundingClientRect();
      const v = r.bottom > 0 && r.top < window.innerHeight;
      if (v !== seen) { seen = v; sync(); }
    }) : null;
    const visible = () => seen && !document.hidden;
    visible.stop = () => { if (io) { io.disconnect(); check.stop(); } document.removeEventListener("visibilitychange", sync); };
    return visible;
  };
  // A canvas sized to its box in device pixels, capped at 2x; returns the ratio.
  const fitCanvas = (c, W, H) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    return dpr;
  };
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
  // A jump to a section of this page by a search result or a cited source;
  // a link to one, or arriving with one in the address, is picked up where
  // it matters (initStack). Anything the scroll would pass on the way can
  // make itself small first. `to` is where it lands, null for the top.
  const jumpTo = (to) => document.dispatchEvent(new CustomEvent("nav:jump", { detail: to }));
  const hashTarget = (hash) => { try { return document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) { return null; } };

  // While the page is scrolling, the pieces that draw their own frames stand
  // still. A reveal happens during a scroll by definition, and the fields and
  // the strands are the main thread's biggest other customer - most of all on a
  // phone, where they cost several times what they do on a laptop. Holding them
  // for the length of the scroll hands those frames to the transitions. Each
  // piece already knows how to pause and pick its clock back up, so this is the
  // same pause the button does; everything resumes a breath after the last
  // scroll event.
  let scrolling = false, scrollTimer = 0;
  const scrollWatchers = new Set();
  const isScrolling = () => scrolling;
  const whileStill = (sync) => { scrollWatchers.add(sync); return () => scrollWatchers.delete(sync); };
  window.addEventListener("scroll", () => {
    if (!scrolling) { scrolling = true; scrollWatchers.forEach((f) => f()); }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { scrolling = false; scrollWatchers.forEach((f) => f()); }, 140);
  }, { passive: true });

  // A piece that draws its own frames waits for its block to land before it
  // starts. The charts and the matrix already do this through onceInView, which
  // holds until the block's reveal and then lets it lead by 200ms; the canvases
  // ran off their own observer instead, so an 88-strand first frame, or a
  // field's first pass, was drawn in the middle of the block's transition. That
  // is the hitch as a card arrives. A block that never reveals still gets its
  // piece: every wait here has a way out.
  const afterReveal = (el, fn) => {
    const block = el.closest("[data-reveal]");
    if (!block || !document.documentElement.classList.contains("anim")) { fn(); return; }
    let done = false, timer = 0;
    const go = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener("reveal", onReveal);
      block.removeEventListener("transitionend", onEnd);
      fn();
    };
    const onEnd = (e) => { if (e.target === block) go(); };     // transitionend bubbles; a child's is not this one
    const onReveal = () => {
      if (!block.classList.contains("in")) return;
      if (getComputedStyle(block).opacity === "1") { go(); return; }   // it landed before this piece asked: no transition is coming
      document.removeEventListener("reveal", onReveal);
      block.addEventListener("transitionend", onEnd);
      clearTimeout(timer);
      timer = setTimeout(go, 1600);                             // the rise may already be over, or never end
    };
    timer = setTimeout(go, 6000);
    if (block.classList.contains("in")) onReveal(); else document.addEventListener("reveal", onReveal);
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
      left.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], { duration: 850, easing: EASE_IN_OUT, fill: "forwards" });
      right.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], { duration: 850, easing: EASE_IN_OUT, fill: "forwards" });
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
    // On the home page the bar also says where the reader is: the link for
    // the section under the top third of the viewport is marked current
    // (a location, not a page). Nothing is marked while the hero is up, or
    // from the contact block down, which no link names.
    const spots = [["work", 'a[href="/work.html"]'], ["leadership", 'a[href="/#leadership"]'], ["about", 'a[href="/#about"]']]
      .map(([id, sel]) => [document.getElementById(id), $(`.nav-links ${sel}`, nav)]);
    const spy = spots.every(([s, a]) => s && a) && !$(".nav-links a[aria-current='page']", nav) ? spots : [];
    const end = document.getElementById("contact");
    let here = null;
    const locate = () => {
      const line = window.scrollY + window.innerHeight * 0.34;
      let now = null;
      for (const [s, a] of spy) { if (s.offsetTop <= line) now = a; }
      if (end && end.offsetTop <= line) now = null;
      if (now === here) return;
      if (here) here.removeAttribute("aria-current");
      if (now) now.setAttribute("aria-current", "location");
      here = now;
    };
    let queued = false;
    const onScroll = () => { queued = false; nav.classList.toggle("scrolled", window.scrollY > 8); if (spy.length) locate(); };
    onScroll();
    window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } }, { passive: true });   // once a frame, as the other scroll readers do
    const toggle = $(".nav-toggle");
    if (!toggle) return;
    // While the menu is open the page holds still: the root's overflow is
    // hidden (styles.css) and, for iOS Safari, which rubber-bands the page
    // behind the sheet regardless, a touch drag is refused unless it is
    // scrolling the rows themselves (a phone on its side). Nothing moves, so
    // nothing has to be put back on close.
    const rows = $(".nav-links ul", nav);
    const holdTouch = (e) => {
      if (rows && rows.contains(e.target) && rows.scrollHeight > rows.clientHeight) return;
      e.preventDefault();
    };
    // While the sheet is open the page behind it is inert, so Tab stays in
    // the bar and the sheet and a screen reader doesn't wander underneath.
    const behind = () => [$("main"), $(".chat-launch")].filter(Boolean);
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.documentElement.classList.toggle("nav-locked", open);
      behind().forEach((el) => { el.inert = open; });
      if (open) document.addEventListener("touchmove", holdTouch, { passive: false });
      else document.removeEventListener("touchmove", holdTouch);
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    // The sheet is for widths under 1024px (styles.css); a tablet turned to
    // a wider screen with it open would keep the page locked, so it closes.
    const sheet = window.matchMedia("(max-width: 1023px)");
    sheet.addEventListener("change", () => { if (!sheet.matches && nav.classList.contains("open")) setOpen(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !nav.classList.contains("open")) return;
      setOpen(false);
      toggle.focus();
    });
    document.addEventListener("nav:close", () => { if (nav.classList.contains("open")) setOpen(false); });   // the palette takes the screen
    $$(".nav-links a", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
  };

  /* ---- Scroll reveal ----
     Content is visible by default. JS opts into the animation by marking the
     document, so a failed, blocked or throttled script can never hide a section.
     A failsafe drops the animation if nothing has revealed after 2.5s.

     Every major block is tagged so sections rise in: anything already marked
     keeps its tag, otherwise each direct child of a section gets one. On
     first paint everything on screen rises at once; after that a block rises
     once its top crosses a line 90% down the viewport, so it starts as it
     appears and has landed before the reader gets to it. The line drops to
     the bottom edge as the page runs out of scroll, so the last blocks never
     wait for room that isn't there. Blocks that cross together follow each
     other 60ms apart, in document order. The rise runs on a timer, not with
     the scroll, so nothing at rest is ever left half faded. */
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
    const LINE = 0.9;
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
    // A waiting block is drawn --reveal-y below its place, and the observers
    // see the drawn box, so every test here allows for the lift: a block
    // counts by where it will rest, not where it waits.
    const lift = parseFloat(cssVar("--reveal-y", "48px")) || 0;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); whole.unobserve(e.target); } });
    }, { rootMargin: `0px 0px ${Math.round(lift - window.innerHeight * (1 - LINE))}px 0px`, threshold: 0 });
    // A block the reader can already see whole rises too, wherever it sits:
    // a short one resting under the line would otherwise stay a blank.
    const whole = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.intersectionRatio >= 0.99) { show(e.target); io.unobserve(e.target); whole.unobserve(e.target); } });
    }, { rootMargin: `0px 0px ${Math.round(lift)}px 0px`, threshold: 0.99 });
    revealEls.forEach((el) => { io.observe(el); whole.observe(el); });

    // Backstop for the observer. It measures only the elements still hidden and
    // detaches itself once they have all been revealed, so a long page is not
    // paying for a full measure pass on every scroll tick for the rest of the visit.
    // On first paint anything on screen counts wherever it sits (the first
    // screen is never left with a blank band at its foot); after that a
    // section waits at the line.
    let pending = revealEls.slice();
    const sweep = (firstPaint) => {
      if (!pending.length) return;
      const vh = window.innerHeight;
      const room = Math.max(0, document.documentElement.scrollHeight - vh - window.scrollY);
      const line = vh - Math.min(vh * (1 - LINE), room);
      const still = [];
      for (const el of pending) {
        if (el.classList.contains("in")) continue;
        const r = el.getBoundingClientRect();
        const top = r.top - lift, bottom = r.bottom - lift;   // where it will rest
        const edge = firstPaint ? vh : line;
        if ((top < edge || (top >= 0 && bottom <= vh)) && bottom > 0) { show(el); io.unobserve(el); whole.unobserve(el); }
        else still.push(el);
      }
      pending = still;
      if (!pending.length) { move.stop(); io.disconnect(); whole.disconnect(); }
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
    // Every animation plays where it is seen (John, Sep 28 2026): at least 60%
    // of the element on screen, or as much as fits when it is taller than 80%
    // of the viewport, so a tall one still fires.
    const h = Math.max(1, el.getBoundingClientRect().height);
    threshold = Math.min(Math.max(threshold, 0.6), (window.innerHeight * 0.8) / h);
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
    // Figure A's wave (see styles.css): a circle that takes each ring's shape in
    // turn. Every ring is the outer one scaled about the point they share at the
    // bottom, so a ring's shape is just its width over the figure's.
    const nest = rings.length ? rings[0].parentElement : null;
    const ring = (k) => rings.find((r) => Number(r.dataset.ring) === k);
    const size = (k) => ring(k).offsetWidth / nest.offsetWidth;
    const HOP = 300, SOFT = "cubic-bezier(.33, 1, .68, 1)", SETTLE = "cubic-bezier(.34, 1.56, .64, 1)";
    let wave = null, timers = [];
    if (nest && !reduced) {
      nest.insertAdjacentHTML("beforeend", '<svg class="nest-wave" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="50" vector-effect="non-scaling-stroke"/></svg>');
      wave = $(".nest-wave circle", nest);
    }
    const flex = (k, dir, delay = 0) => ring(k).animate(   // a ring gives a little the way the wave came
      [{ transform: "none", transformOrigin: "50% 100%", easing: SOFT }, { transform: `scale(${1 + dir * 0.018})`, transformOrigin: "50% 100%", offset: 0.3 }, { transform: "none", transformOrigin: "50% 100%" }],
      { duration: 560, delay });
    // Send the wave from ring `from` to ring `to`, a hop per ring, each hop easing
    // into its ring. `spill` carries it past the outer ring before it dissolves.
    // Returns the rings it reaches and when it lands, in ms.
    const travel = (from, to, spill = false, hop = HOP) => {
      const dir = to >= from ? 1 : -1, stops = [];
      for (let k = from; k !== to; k += dir) stops.push(k + dir);
      const land = stops.length * hop, total = land + (spill ? 420 : 0);
      const frames = [from, ...stops].map((k, n) => ({ transform: `scale(${size(k)})`, offset: land / total * n / stops.length, easing: SOFT }));
      if (spill) frames.push({ transform: "scale(1.07)", offset: 1 });
      wave.getAnimations().forEach((a) => a.cancel());
      wave.animate(frames, { duration: total });
      wave.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: spill ? land / total : 0.8 }, { opacity: 0 }], { duration: total });
      return { stops, land };
    };
    const light = (to) => rings.forEach((r) => r.classList.toggle("on", Number(r.dataset.ring) === to));
    // A picked layer: the old ring lets go, the wave crosses any ring between,
    // and the new one lights and flexes as it lands. A keyboard move (`jump`)
    // just switches. Returns the landing time.
    const move = (from, to, jump = false) => {
      timers.forEach(clearTimeout);
      timers = [];
      rings.forEach((r) => r.classList.remove("pass"));
      if (!wave || jump || from === to || nest.classList.contains("is-staged")) {
        if (wave && jump && !nest.classList.contains("is-staged")) wave.getAnimations().forEach((a) => a.cancel());
        light(to);
        return 0;
      }
      light(-1);
      const { stops, land } = travel(from, to), dir = to > from ? 1 : -1;
      stops.forEach((k, n) => {
        const at = (n + 1) * HOP;
        flex(k, dir, at);
        timers.push(setTimeout(() => {
          if (k === to) { light(to); return; }
          ring(k).classList.add("pass");
          timers.push(setTimeout(() => ring(k).classList.remove("pass"), 160));
        }, at));
      });
      return land;
    };
    // The entrance: the disc springs in, then the wave carries out to the edge,
    // bringing each ring (and its name, rising) in as it arrives.
    const enter = () => {
      root.classList.add("is-played");
      root.style.setProperty("--mark-delay", "380ms");
      const lead = 320, hop = 400, { stops } = travel(0, 2, true, hop);   // a slower beat than a click's
      wave.getAnimations().forEach((a) => { a.effect.updateTiming({ delay: lead, fill: "backwards" }); });
      ring(0).animate([{ opacity: 0, transform: "scale(.6)", transformOrigin: "50% 50%", easing: SETTLE }, { opacity: 1, transform: "none", transformOrigin: "50% 50%" }], { duration: 560, fill: "backwards" });
      stops.forEach((k, n) => {
        const at = lead + (n + 1) * hop;
        ring(k).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay: at, fill: "backwards", easing: "linear" });
        $(".nlbl", ring(k)).animate([{ translate: "0 8px" }, { translate: "0 0" }], { duration: 480, delay: at, fill: "backwards", easing: SOFT });
        flex(k, 1, at);
      });
      nest.classList.remove("is-staged");
    };
    if (wave) {
      nest.classList.add("is-staged");
      onceInView(nest, 0.5, (animate) => {
        if (animate) setTimeout(enter, 250); else nest.classList.remove("is-staged");
      });
    }

    const select = (i, focus, first = false) => {
      const was = current;
      current = i;
      root.classList.toggle("instant", Boolean(focus));   // keyboard moves repeat; they don't animate
      const lands = move(was, i, first || Boolean(focus));
      root.style.setProperty("--mark-delay", `${lands}ms`);   // the marker draws as the ring lights
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        // the hidden panels fade for .22s; keeping them out of the tab order
        // means a quick Tab after an arrow key can't land on one mid-fade
        if (panels[k]) { panels[k].classList.toggle("active", on); panels[k].tabIndex = on ? 0 : -1; }
      });
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
    select(current, false, true);
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
    let i = 0, timer = null, playing = true, focus = false;

    const show = (k) => {
      i = (k + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle("active", n === i));
      dots.forEach((d, n) => d.setAttribute("aria-current", n === i ? "true" : "false"));
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const sync = () => {
      const run = playing && !focus && visible();
      if (run && !timer) timer = setInterval(() => show(i + 1), DELAY);
      if (!run) stop();
      track.setAttribute("aria-live", playing ? "off" : "polite");
      setPaused(pause, playing, "rotation");
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
    const visible = whileOnScreen(c, .25, sync);
    show(0);
    sync();
  });

  /* ---- Walkthrough animations: poster first, animate on demand ---- */
  const initWalkthroughs = () => $$(".walk").forEach((w) => {
    const img = $("img", w), btn = $(".play", w);
    if (!img || !btn) return;
    // Playing, the recording loops; the pause in the corner (the WCAG 2.2.2
    // stop, as on every moving piece here) puts the poster back and returns
    // the Play control, and takes focus from Play when Play had it.
    const poster = img.getAttribute("src");
    const halt = document.createElement("button");
    halt.type = "button"; halt.className = "art-ctl walk-stop"; halt.hidden = true;
    halt.innerHTML = `<svg class="i-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z"/><path d="M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z"/></svg><svg class="i-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"/></svg>`;
    setPaused(halt, true, "the recording");
    w.append(halt);
    halt.addEventListener("click", () => {
      img.src = poster;
      w.classList.remove("playing");
      btn.classList.remove("playing");
      btn.setAttribute("aria-pressed", "false");
      delete btn.dataset.busy;
      halt.hidden = true;
      btn.focus({ preventScroll: true });
    });
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
        const had = document.activeElement === btn;
        halt.hidden = false;
        if (had) halt.focus({ preventScroll: true });   // Play is hidden now; focus doesn't drop to the page
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

  /* ---- AI card: the agents at work, as a process ----
     The card's copy played out one step at a time, after ramp.com's feature cards
     and harvey.ai's product UI: the brief an agent picks up, its run ticking
     through its steps, the team's review. Three flows take turns (the Figma
     library audit, a flow turned into a prototype, research synthesis), each on
     real facts: the site's own contrast fix and the Verifications usability
     quote. It plays once the card lands, while it stays on screen; the
     button in the corner is the WCAG 2.2.2 stop, and under reduced motion
     it holds on the audit, fixed. Replaced the strands canvas
     on Sep 28, 2026. */
  // Realistic app windows, after Harvey's product UI: a title bar with a breadcrumb,
  // the brief as a task, the agent's run as a step list that spins and ticks, then
  // the review. Every figure in them is real: the site's own contrast fix and the
  // Verifications usability quote.
  const SV = {
    mark: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 1.5v2.5M6 8v2.5M1.5 6H4M8 6h2.5"/></svg>',
    rule: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 1.5h4.5l2 2v7H3z"/></svg>',
    src: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="6" r="4.2"/></svg>',
  };
  const tb = (crumbs, right) => `<div class="st-tb"><span class="lg">${SV.mark}</span>${crumbs.map((c, i) => i === crumbs.length - 1 ? `<b>${c}</b>` : `${c}<span class="sep">/</span>`).join("")}<span class="rt">${right}</span></div>`;
  const brief = (crumb, right, text, chips, icon, agent) => `<div class="st-card st-app">${tb(["Agents", crumb], right)}
    <div class="st-bd"><div class="st-lbl">Brief</div><div class="st-txt">${text}</div><div class="st-chips">${chips.map((c) => `<span class="st-chip">${SV[icon]}${c}</span>`).join("")}</div></div>
    <div class="st-ft"><span class="st-av">${SV.mark}</span>${agent}<span class="st-btn">Start run <span class="st-kbd">⏎</span></span></div></div>`;
  const run = (agent, steps, out) => `<div class="st-card st-app">${tb([agent], `<span class="st-state"><span class="st-spin"></span><span class="st-okdot"></span><span class="st-s">Running</span></span>`)}
    <ul class="st-steps">${steps.map(([t, m]) => `<li><span class="ic"></span>${t}${m ? `<span class="m${m[1] ? " bad" : ""}">${m[0]}</span>` : ""}</li>`).join("")}</ul>
    <div class="st-out">${out}</div></div>`;
  const review = (crumbs, title, sub, extra, ghost, solid) => `<div class="st-card st-app">${tb(crumbs, "Review")}
    <div class="st-bd"><div class="st-lbl">Design team</div><div class="st-txt">${title}</div><div class="st-lbl" style="margin:4px 0 0">${sub}</div>${extra}</div>
    <div class="st-ft"><span class="st-av lt">DT</span>Approved<span class="st-btn gh">${ghost}</span><span class="st-btn ok">${solid}</span></div></div>`;
  const doneText = (w, t) => { const s = w.querySelector(".st-s"); if (s) s.textContent = t; };
  const STORY = [
    { brief: brief("Library audit", "Monthly", "Audit the Figma library and write the exact fix for each issue.", ["Tokens", "Spacing", "Contrast AA"], "rule", "Audit agent"),
      work: run("Audit agent", [["Read the brief and rules"], ["Scan Button / Secondary"], ["Check label contrast", ["3.8:1", 1]], ["Write the fix"]],
        `<div class="st-diff"><div class="dl">- color: #8A8279</div><div class="ad">+ color: Ink 3  #6F675D</div></div><div class="st-meta">Button / Secondary<span class="st-tag2">5.6:1 · AA</span></div>`),
      review: review(["Library", "Button / Secondary"], "Fix approved", "Label color moves to Ink 3", "", "View diff", "Merged"),
      set: (w, done) => doneText(w, done ? "Done · 1 fix" : "Running") },
    { brief: brief("Prototype", "Flow", "Turn the application flow into a prototype customers can try.", ["Design system parts", "Real copy"], "rule", "Prototype agent"),
      work: run("Prototype agent", [["Read the flow", ["3 screens"]], ["Place design system parts"], ["Link Income, Documents, Review"], ["Publish a shareable link"]],
        `<div class="st-meta" style="border-top:0">Application flow<span class="st-tag2">Clickable</span></div>`),
      review: review(["Prototype", "Application flow"], "Ready for customer sessions", "Checked copy, parts and every link", "", "Open", "Approved"),
      set: (w, done) => doneText(w, done ? "Done · prototype live" : "Running") },
    { brief: brief("Research", "Synthesis", "Find why applicants stall after upload.", ["Customer calls", "Analytics", "FullStory"], "src", "Research agent"),
      work: run("Research agent", [["Read customer calls"], ["Read support tickets"], ["Read analytics"], ["Watch FullStory sessions"]],
        `<div class="st-lbl" style="padding:8px 10px 0;margin:0">Theme</div><div class="st-theme2">After upload, the dashboard goes quiet</div>`),
      review: review(["Research", "Upload status"], "Show a status the moment a file lands", "Synthesis for the designers",
        `<div class="st-quote">“If that ‘in review’ would’ve been maybe bigger or a different color, I would’ve noticed it earlier.”<span>Usability session</span></div>`, "Open synthesis", "Shared"),
      set: (w, done) => doneText(w, done ? "Done · 1 theme" : "Running") },
  ];
  const STEP_END = [4.2, 11.2, 15.8], WORK_DONE = 4.2 + 3.8, EXIT = 15.8, CYCLE = 16.8;   // slowed by half on John's ask
  const STORY_REST = 9.6;   // the still under reduced motion: the audit, fixed
  const GEO = { tall: { SW: 296, SH: 272, gap: 320 }, wide: { SW: 296, SH: 272, gap: 380 } };   // the card (288 wide, 266 at its tallest) with little room to spare, so it reads large (John, Sep 28)
  const makeStory = (el) => {
    const root = document.createElement("div");
    root.className = "story"; root.setAttribute("aria-hidden", "true");
    root.innerHTML = `<div class="st-scene">` + STORY.map((s) => `<div class="st-ex"><div class="st-track">
      <span class="st-line stub" data-stub="0"></span><span class="st-line" data-l="0"></span><span class="st-line" data-l="1"></span><span class="st-line stub" data-stub="1"></span>
      <span class="st-pkt" data-p="0"></span><span class="st-pkt" data-p="1"></span>
      <div class="st-step">${s.brief}</div><div class="st-step">${s.work}</div><div class="st-step">${s.review}</div></div></div>`).join("") + `</div>`;
    el.insertBefore(root, el.querySelector(".art-ctl"));   // under the pause button
    const scene = root.querySelector(".st-scene");
    const exs = [...root.querySelectorAll(".st-ex")].map((ex) => ({ ex, track: ex.querySelector(".st-track"),
      steps: [...ex.querySelectorAll(".st-step")], lines: [...ex.querySelectorAll("[data-l]")], stubs: [...ex.querySelectorAll("[data-stub]")], pkts: [...ex.querySelectorAll(".st-pkt")] }));
    let layout = "", g = GEO.tall;
    const place = () => {
      const tall = layout === "tall", c = tall ? g.SW / 2 : g.SH / 2, S = 150;
      for (const e of exs) {
        e.steps.forEach((s, i) => { s.style.left = `${tall ? c : i * g.gap}px`; s.style.top = `${tall ? i * g.gap : c}px`; });
        e.lines.forEach((l, i) => { l.style.cssText = tall ? `left:${c}px;top:${i * g.gap}px;height:${g.gap}px` : `left:${i * g.gap}px;top:${c}px;width:${g.gap}px`; });
        e.stubs.forEach((l, i) => { const at = i ? 2 * g.gap : -S; l.style.cssText = (tall ? `left:${c}px;top:${at}px;height:${S}px` : `left:${at}px;top:${c}px;width:${S}px`) + `;--dir:${i ? (tall ? "0deg" : "270deg") : (tall ? "180deg" : "90deg")}`; });
        e.pkts.forEach((p, i) => { p.style.left = `${tall ? c : i * g.gap}px`; p.style.top = `${tall ? i * g.gap : c}px`; p.style.setProperty("--gap", `${g.gap}px`); });
      }
    };
    const size = () => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const next = H / W >= .8 ? "tall" : "wide";
      if (next !== layout) { layout = next; g = GEO[layout]; root.dataset.layout = layout; place(); last = ""; }
      // fit to the room the pause button leaves: above it on a tall plate, beside it on a wide one
      const bw = layout === "wide" ? W - 104 : W - 24, bh = layout === "wide" ? H - 16 : H - 60;   // wide: equal room each side, so the card sits in the middle and clear of the button
      const s = Math.min(bw / g.SW, bh / g.SH);
      scene.style.left = `${(layout === "wide" ? 52 : 12) + bw / 2}px`; scene.style.top = `${(layout === "wide" ? 8 : 12) + bh / 2}px`;
      scene.style.transform = `translate(${-g.SW * s / 2}px, ${-g.SH * s / 2}px) scale(${s})`;
    };
    let last = "";
    size();
    const frame = (t) => {
      t = Math.max(0, t);   // a frame's timestamp can land a hair before the clock started
      const k = Math.floor(t / CYCLE) % STORY.length, u = t % CYCLE;
      const step = u < STEP_END[0] ? 0 : u < STEP_END[1] ? 1 : 2, out = u >= EXIT, done = u >= WORK_DONE;
      const sub = step === 1 ? Math.min(3, Math.floor((u - STEP_END[0]) / .95)) : -1;   // the run ticks a step about every second
      const state = [layout, k, step, out, done, sub].join();
      if (state === last) return;
      const prev = last.split(",");
      last = state;
      exs.forEach((e, i) => {
        const me = i === k;
        e.ex.classList.toggle("on", me && !out);
        const at = me ? step : 0, tall = layout === "tall";
        // the view centers the active step; jumping back at the start of an example happens while it is hidden
        e.track.style.transition = me ? "" : "none";
        e.track.style.transform = tall ? `translate(0, ${g.SH / 2 - at * g.gap}px)` : `translate(${g.SW / 2 - at * g.gap}px, 0)`;
        e.steps.forEach((s, j) => { s.classList.toggle("on", me && j === at); s.classList.toggle("past", me && j < at); });
        e.lines.forEach((l, j) => { l.style.transition = me ? "" : "none"; l.classList.toggle("on", me && at > j); });
        e.pkts.forEach((p, j) => {
          const go = me && at === j + 1 && !(prev[1] == k && prev[2] == at);
          if (go) { p.classList.remove("go"); void p.offsetWidth; p.classList.add("go"); }
          else if (!me || at !== j + 1) p.classList.remove("go");
        });
        const w = e.steps[1];
        w.querySelectorAll(".st-steps li").forEach((li, j) => {
          li.classList.toggle("ok", me && (done || (step === 1 && j < sub)));
          li.classList.toggle("act", me && step === 1 && !done && j === sub);
        });
        w.classList.toggle("working", me && step === 1 && !done);
        w.classList.toggle("done", me && done);
        STORY[i].set(w, me && done);
      });
    };
    return { size, frame };
  };

  const initStory = () => $$("[data-story]").forEach((fig) => {
    const btn = $(".art-ctl", fig), eng = makeStory(fig);
    fig.classList.add("live");
    if ("ResizeObserver" in window) new ResizeObserver(() => eng.size()).observe(fig);
    if (reduced) { eng.frame(STORY_REST); return; }
    // the clock only runs while playing, so a pause freezes the story and resume picks it up
    // It starts once the card lands, without waiting for the scroll to settle,
    // and the brief holds 2.5s before it hands off (John, Sep 28: the full 4.2s
    // hold took too long to start; a 1s hold from first view ran it too fast).
    let raf = 0, acc = STEP_END[0] - 2.5, since = 0, playing = true, landed = false;
    eng.frame(acc);
    const tick = (now) => { eng.frame(acc + (now - since) / 1000); raf = requestAnimationFrame(tick); };
    const sync = () => {
      const run = playing && landed && visible();
      fig.classList.toggle("run", !!run);
      if (run && !raf) { since = performance.now(); raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; acc += (performance.now() - since) / 1000; }
      setPaused(btn, playing, "animation");
    };
    if (btn) { btn.hidden = false; btn.addEventListener("click", () => { playing = !playing; sync(); }); }
    const visible = whileOnScreen(fig, .25, sync);
    afterReveal(fig, () => { eng.size(); landed = true; sync(); });
  });

  /* ---- The brief, as a run ----
     The agentic audit's brief drawn as the six steps it sets up, played the
     way the AI card plays its agents: one step wakes out of a slight tilt,
     works (its counts run up, its rows arrive, a spinner in its title bar),
     ticks done, and the work travels a dotted wire to the next. After step
     six the wire back to step one draws, for the monthly rerun, then the run
     holds and starts over. The wires are measured from the cards, so they
     follow the three-across layout and the single column alike (the loop is
     only drawn when step six sits under step one). The clock only runs while
     playing, on screen and after the panel lands; the button is the WCAG
     2.2.2 stop. Under reduced motion, or without the script, every step
     shows done. */
  const RUN_STEP = 2.3, RUN_WORK = 1.5, RUN_WIRE = .8, RUN_LEAD = .4, RUN_HOLD = 3.4;
  const initRun = () => $$("[data-brief-run]").forEach((fig) => {
    const nodes = $$(".rn-node", fig), svg = $(".rn-wires", fig), loopLbl = $(".rn-loop", fig), btn = $(".art-ctl", fig);
    const NS = "http://www.w3.org/2000/svg", n = nodes.length;
    const nums = nodes.map((nd) => $$("[data-to]", nd).map((el) => ({ el, to: +el.dataset.to, dp: +(el.dataset.dp || 0), suf: el.dataset.suffix || "" })));
    const bars = nodes.map((nd) => $$(".rn-bar i", nd));
    const parts = nodes.map((nd) => $$(".rn-rows li, .rn-fix, .rn-hand", nd));
    const fmt = (v, dp) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    const start = (i) => RUN_LEAD + i * RUN_STEP;
    const LOOP_AT = start(n - 1) + RUN_WORK, END = LOOP_AT + RUN_WIRE + RUN_HOLD, CYCLE = END + .8;
    // wires: i joins step i to i+1; the last joins step six back to step one
    const wires = nodes.map((_, i) => {
      const g = document.createElementNS(NS, "g"), mk = (tag, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute("class", cls); g.appendChild(e); return e; };
      const trk = mk("path", "trk"), lit = mk("path", "lit"), arw = mk("path", "arw"), pkt = mk("circle", "pkt");
      pkt.setAttribute("r", "4");
      svg.appendChild(g);
      return { g, trk, lit, arw, pkt, len: 0, on: true, from: i, to: (i + 1) % n };
    });
    const size = () => {
      const box = fig.getBoundingClientRect();
      const r = nodes.map((nd) => { const q = nd.getBoundingClientRect(); return { l: q.left - box.left, r: q.right - box.left, t: q.top - box.top, b: q.bottom - box.top }; });
      const G = 8;   // the wire stops short of a card's edge
      wires.forEach((w) => {
        const a = r[w.from], b = r[w.to];
        let pts = null;
        const midY = (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2, midX = (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2;
        if (b.l >= a.r - 1 && midY > Math.max(a.t, b.t)) pts = [[a.r + G, midY], [b.l - G, midY]];
        else if (b.r <= a.l + 1 && midY > Math.max(a.t, b.t)) pts = [[a.l - G, midY], [b.r + G, midY]];
        else if (b.t >= a.b - 1 && midX > Math.max(a.l, b.l)) pts = [[midX, a.b + G], [midX, b.t - G]];
        else if (b.b <= a.t + 1 && midX > Math.max(a.l, b.l)) {
          // back up: only when nothing sits between the two (the loop, three across)
          const clear = r.every((q, k) => k === w.from || k === w.to || q.b <= b.b || q.t >= a.t || q.r <= Math.max(a.l, b.l) || q.l >= Math.min(a.r, b.r));
          if (clear) pts = [[midX, a.t - G], [midX, b.b + G]];
        }
        w.on = !!pts;
        w.g.style.display = pts ? "" : "none";
        if (!pts) return;
        const d = `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;
        w.trk.setAttribute("d", d); w.lit.setAttribute("d", d);
        w.len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        w.a = pts[0]; w.b = pts[1];
        const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180 / Math.PI;
        w.arw.setAttribute("d", "M-5 -4.5L0 0L-5 4.5");
        w.arw.setAttribute("transform", `translate(${pts[1][0]} ${pts[1][1]}) rotate(${ang})`);
        if (w.to === 0 && loopLbl) { loopLbl.style.left = `${pts[0][0] + 14}px`; loopLbl.style.top = `${(pts[0][1] + pts[1][1]) / 2}px`; }
      });
      if (loopLbl) loopLbl.hidden = !wires[n - 1].on;
      frame(last);
    };
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    let last = 1e9;
    // one frame of the run at time t; t past the end of a cycle shows it finished
    const frame = (t) => {
      last = t;
      const u = t >= CYCLE ? END : t % CYCLE, reset = u > END;
      nodes.forEach((nd, i) => {
        const s = start(i), on = !reset && u >= s, ok = on && u >= s + RUN_WORK, p = on ? ease((u - s) / (RUN_WORK * .85)) : 0;
        nd.classList.toggle("on", on && !ok);
        nd.classList.toggle("ok", ok);
        nums[i].forEach((m) => { m.el.textContent = fmt(ok ? m.to : m.to * p, m.dp) + m.suf; });
        bars[i].forEach((b) => b.style.setProperty("--p", ok ? 1 : p));
        parts[i].forEach((el, k) => el.classList.toggle("in", on && u >= s + .25 + k * .3));
      });
      wires.forEach((w, i) => {
        const s = i === n - 1 ? LOOP_AT : start(i) + RUN_WORK, p = reset ? 0 : Math.min(1, Math.max(0, (u - s) / RUN_WIRE));
        const q = ease(p), dots = w.len * q;
        // the darker dots run as far as the work has got, cut off at the packet
        w.lit.style.opacity = q > 0 ? 1 : 0;
        w.lit.style.strokeDasharray = q >= 1 ? "0 8" : dashTo(dots);
        w.arw.style.opacity = q >= 1 ? 1 : 0;
        const moving = p > 0 && p < 1;
        w.pkt.style.opacity = moving ? 1 : 0;
        if (w.a) w.pkt.setAttribute("cx", w.a[0] + (w.b[0] - w.a[0]) * q), w.pkt.setAttribute("cy", w.a[1] + (w.b[1] - w.a[1]) * q);
      });
      if (loopLbl) loopLbl.style.opacity = reset || u < LOOP_AT + RUN_WIRE * .5 ? .35 : 1;
    };
    // a dash pattern of dots up to `len`, then a gap as long as the wire
    const dashTo = (len) => [...Array(Math.max(0, Math.floor(len / 8))).fill("0 8"), "0 100000"].join(" ");
    fig.classList.add("live");
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(fig);
    if (document.fonts) document.fonts.ready.then(size);
    size();
    if (reduced) { frame(1e9); return; }
    let raf = 0, acc = 0, since = 0, playing = true, landed = false;
    frame(0);
    const tick = (now) => { frame(acc + (now - since) / 1000); raf = requestAnimationFrame(tick); };
    const sync = () => {
      const go = playing && landed && visible();
      fig.classList.toggle("playing", !!go);
      if (go && !raf) { since = performance.now(); raf = requestAnimationFrame(tick); }
      if (!go && raf) { cancelAnimationFrame(raf); raf = 0; acc += (performance.now() - since) / 1000; }
      setPaused(btn, playing, "animation");
    };
    if (btn) { btn.hidden = false; btn.addEventListener("click", () => { playing = !playing; sync(); }); }
    const visible = whileOnScreen(fig, .25, sync);
    afterReveal(fig, () => { size(); landed = true; sync(); });
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
  // A ripple from a tap: a ring travelling out at 420px/s with a soft wall
  // 500 units wide, dying away over about two seconds. Returns its strength
  // at distance d from the tap (0 off the ring); a piece scales it and
  // divides by d to push along the radius.
  const rippleAt = (rp, d) => {
    const diff = d - rp.age * 420;
    return diff > 60 || diff < -60 ? 0 : Math.exp(-diff * diff / 500) * Math.exp(-rp.age * 2.2);
  };
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
    dots: ({ ctx, el, ink, accent, rgb }) => {
      const S = 24, DOT = 2, R = 150, F = 10, K = .018, DAMP = .8;   // pitch, radius, push radius, push force, spring, damping
      const BR = 260, BA = .4, BPUSH = 210, BF = .7, BSNAP = .8;     // drifter: radius, tint, push radius, push force vs the cursor's, snap reach as a share of the radius
      const taupe = rgb("--hair-2", "#CFC9BF").join(",");
      const RF = 10;                                        // ripple: force (its shape is rippleAt, shared with the rings)
      const A = .25, MOVED = 1.2;                           // strength on paper (John: 25%, light), px of travel that turns a dot green
      const PAD = 16, FEATHER = 220, UNDER = .35;           // the copy's margin, the run of the fade around it, the dots' strength under the copy (ramp.com: .35 to 1 over the top 45%)
      let W = 0, H = 0, n = 0, hx, hy, ox, oy, vx, vy, k, hf, sprites, sw = 0, energy = 0, hush = "", frames = 0, now = 0;
      const blob = { x: -1, y: -1, speed: 0, held: false };
      // where the drifter wants to be: a slow figure that never repeats exactly
      const roam = (t) => [W * (.5 + .3 * Math.sin(t * .11 + 1.3) + .07 * Math.sin(t * .37)), H * (.52 + .28 * Math.sin(t * .083 + .4) + .06 * Math.cos(t * .29))];
      const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
      const sprite = (color, dpr) => {
        const r = DOT, d = Math.ceil(r * 2 * dpr) + 2, s = document.createElement("canvas");
        s.width = s.height = d;
        const g = s.getContext("2d");
        g.fillStyle = color; g.beginPath(); g.arc(d / 2, d / 2, r * dpr, 0, Math.PI * 2); g.fill();
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
            const rp = rips[r], cx = hx[i] + x - rp.x, cy = hy[i] + y - rp.y, d = Math.sqrt(cx * cx + cy * cy);
            if (d < .01) continue;
            const f = rippleAt(rp, d) * RF / d;
            if (f) { u += cx * f; v += cy * f; }
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
              const rp = rips[k], dx = x - rp.x, dy = y - rp.y, d = Math.sqrt(dx * dx + dy * dy);
              if (d < .01) continue;
              const f = RING * rippleAt(rp, d) / d;
              if (f) { x += dx * f; y += dy * f; }
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
    startField(el);
    onTheme(() => { if (el.field) { el.field.stop(); startField(el); } });   // the sprites and tints are the page's own, so a field restarts in the new register
  });
  const startField = (el) => {
    const c = $("canvas.field", el), btn = $(".art-ctl", el);
    const ctx = c && c.getContext && c.getContext("2d");
    const make = fields[el.dataset.field];
    if (!ctx || !make) return;
    const field = make({ ctx, el, rgb, ink: tint("--ink", "#14100C"), paper: tint("--paper", "#F6F4F0"), accent: hex("--accent", "#3B6B44") });

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      W = el.clientWidth; H = el.clientHeight;
      dpr = fitCanvas(c, W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field.resize(W, H, dpr);
    };

    // The pointer, in the el's pixels. `active` is 1 while the cursor moves
    // and dies away within a second of it resting; the pieces scale their
    // response by it, so a resting cursor leaves the field to settle.
    const p = { x: -9999, y: -9999, vx: 0, vy: 0, active: 0, inside: false, ripples: [] };
    let raf = 0, prev = 0, t = 0, fresh = true, playing = el.dataset.paused !== "1", stirring = true;   // a pause outlives a restart (a theme change)
    let sleeping = false;                                   // a still piece stops asking for frames until something moves it
    const wake = () => { if (sleeping) { sleeping = false; fresh = true; raf = requestAnimationFrame(tick); } };
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
      wake();
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
      wake();
    };

    const tick = (now) => {
      const busy = on || p.inside || p.ripples.length || now - touched < 2500;
      if (!fresh && !busy && !stirring) { raf = 0; sleeping = true; return; }   // a still piece: no frames at all until the pointer, a ripple or a resize wakes it
      raf = requestAnimationFrame(tick);
      if (!fresh && !busy && now - prev < 33) return;   // idle: 30fps is plenty for the breathing
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
      const run = playing && visible() && !isScrolling();
      if (!run) sleeping = false;                           // off screen, paused or scrolling: stopped, not asleep, so the pointer can't start it
      if (run && !raf && !sleeping) { fresh = true; raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      setPaused(btn, playing, "animation");
    };

    size();
    measure();
    el.classList.add("live");
    if (reduced) {
      field.frame(0, 0, p, false);
      const still = "ResizeObserver" in window ? new ResizeObserver(() => { size(); field.frame(0, 0, p, false); }) : null;
      if (still) still.observe(el);
      el.field = { stop() { if (still) still.disconnect(); ctx.clearRect(0, 0, W, H); } };   // initFields restarts it on a theme change, with the new register's colours
      return;
    }
    field.frame(0, 0, p, true);
    const toggle = () => { playing = !playing; el.dataset.paused = playing ? "" : "1"; sync(); };
    if (btn) { btn.hidden = false; btn.addEventListener("click", toggle); }
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerdown", down, { passive: true });
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); stirring = true; if (!raf) field.frame(t, 0, p, true); wake(); }) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", size);
    const visible = whileOnScreen(el, 0, sync);
    const unwatch = whileStill(sync);
    sync();
    el.field = { stop() {
      playing = false; sync();
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerdown", down);
      if (ro) ro.disconnect(); visible.stop(); unwatch();
      if (btn) { btn.removeEventListener("click", toggle); btn.hidden = true; }
      ctx.clearRect(0, 0, W, H);
      el.classList.remove("live");
    } };
  };

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
        svgEl("text", { class: "axis", x: pts[k].x, y: H - 8, "text-anchor": anchor }, grid, W < 300 && k === 0 ? d.label.split(" ")[0] : short(d.label, k, narrow));   // under 300px "Oct ’25" meets "Nov"; the chart's label carries the year
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
        svgEl("text", { class: "anno", x: ax + (right ? -6 : 6), y: ty + 4, "text-anchor": right ? "end" : "start" }, linesSvg, narrow && a.short ? a.short : a.text);
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
        if (animate) afterReveal(shell, play);       // let the card's own reveal land first
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

  /* ---- Matrix: a wall of variants thinning to the set that remains ----
     One dot per variant on a canvas. As the block reveals the wall sweeps in
     from the left, ink at low alpha; then the dots that were cut fade to a
     ghost of themselves and the survivors travel into one block per
     component, tinted by it, each block a column run tall enough for its
     count. The blocks' width against the wall is the reduction. The grid is
     chosen by width so the total factors exactly; the survivors are picked by
     a seeded shuffle so the wall thins the same way every time. Reduced
     motion, or a block that never gets to animate, draws the end state. */
  const initMatrix = () => $$("[data-matrix]").forEach((el) => {
    const canvas = $("canvas", el), plot = $(".matrix-plot", el);
    if (!canvas || !plot) return;
    const total = Number(el.dataset.total) || 0;
    let groups = [];
    try { groups = JSON.parse(el.dataset.groups || "[]"); } catch { return; }
    const kept = groups.reduce((s, g) => s + g.n, 0);
    if (!total || !kept || kept > total) return;
    const ctx = canvas.getContext("2d");
    const ink = tint("--ink", "#14100C");
    const tints = [tint("--accent", "#3B6B44"), tint("--accent-2", "#6E9A5A"), tint("--ink-2", "#5C564E")];
    const WALL = .28, GHOST = .07;

    // a seeded shuffle picks which cells survive
    let seed = 2304;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const survivors = order.slice(0, kept);

    let cols = 0, rows = 0, pitch = 0, dots = [], dpr = 1;
    const layout = () => {
      const w = plot.clientWidth;
      if (!w) return false;
      [cols, rows] = w >= 880 ? [96, 24] : w >= 600 ? [72, 32] : [48, 48];
      if (cols * rows !== total) { cols = Math.ceil(Math.sqrt(total)); rows = Math.ceil(total / cols); }
      pitch = w / cols;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(rows * pitch * dpr);
      canvas.style.height = `${rows * pitch}px`;
      // every dot starts in its own cell; a survivor also has a destination in its group's block
      dots = Array.from({ length: total }, (_, i) => ({ x: i % cols, y: Math.floor(i / cols), tx: i % cols, ty: Math.floor(i / cols), g: -1 }));
      // survivors sorted by where they start, so neighbours travel together
      const set = survivors.slice().sort((a, b) => (a % cols) - (b % cols) || a - b);
      let col = 0, k = 0;
      groups.forEach((grp, gi) => {
        for (let n = 0; n < grp.n; n++, k++) {
          const d = dots[set[k]];
          d.g = gi; d.tx = col + Math.floor(n / rows); d.ty = n % rows;
        }
        col += Math.ceil(grp.n / rows);
      });
      return true;
    };

    const ease = (t) => 1 - Math.pow(1 - t, 3);
    // t is the time into the piece in ms; the wall sweeps in over the first
    // second, holds, then the cut runs from 1500 to 2700
    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = pitch * .3, half = pitch / 2;
      const cut = Math.min(Math.max((t - 1500) / 1200, 0), 1), move = ease(cut);
      for (const d of dots) {
        const sweep = Math.min(Math.max((t - d.x * 7) / 350, 0), 1);   // each column 7ms after the last
        if (sweep <= 0) continue;
        if (d.g < 0) {
          ctx.fillStyle = ink(WALL * sweep - (WALL - GHOST) * cut);
          ctx.beginPath(); ctx.arc(d.x * pitch + half, d.y * pitch + half, r, 0, Math.PI * 2); ctx.fill();
        } else {
          const x = d.x + (d.tx - d.x) * move, y = d.y + (d.ty - d.y) * move;
          ctx.fillStyle = cut > 0 ? tints[d.g](Math.min(1, WALL * sweep + (1 - WALL) * move)) : ink(WALL * sweep);
          ctx.beginPath(); ctx.arc(x * pitch + half, y * pitch + half, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    };

    let played = false, start = 0, raf = 0;
    const END = 3000;
    const frame = (now) => {
      const t = now - start;
      draw(t);
      if (t < END) raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (played) return;
      played = true;
      start = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const settle = () => { played = true; cancelAnimationFrame(raf); draw(END); };
    onTheme(() => { if (played) { cancelAnimationFrame(raf); draw(END); } });   // the tints are the page's own: redraw the settled plot in the new register

    if (!layout()) return;
    onceInView(plot, 0.35, (animate) => {
      if (animate && !reduced) afterReveal(plot, play);    // let the block's own reveal land first
      else settle();
    });
    const relayout = () => { if (layout() && played) { cancelAnimationFrame(raf); draw(END); } };
    if ("ResizeObserver" in window) {
      let w = plot.clientWidth;
      new ResizeObserver(() => { if (plot.clientWidth !== w) { w = plot.clientWidth; relayout(); } }).observe(plot);
    } else {
      window.addEventListener("resize", debounce(relayout, 120));
    }
  });

  /* ---- Configurator: the old .Button and the new Button, live ----
     Each side is a form of radios and checkboxes under chips; the specimen
     above it is repainted from the form on every change. The colors are
     Best Egg's own, taken from the variant sheets, so the specimen stands
     in for a screenshot. Nothing here is counted: the sums under each side
     are the file's, written in the markup. */
  const initConfig = () => $$("[data-config]").forEach((root) => {
    const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5279 7.13967C11.3077 5.71322 11.6977 5 11.9958 5C12.294 5 12.6839 5.71322 13.4638 7.13967C14.2665 8.60787 15.3392 9.69316 16.8489 10.52C18.2778 11.3026 18.9922 11.6938 18.9922 11.9923C18.9922 12.2908 18.2773 12.6825 16.8475 13.4658C15.3808 14.2693 14.2966 15.3432 13.4706 16.8545C12.6889 18.2848 12.298 19 11.9998 19C11.7017 19 11.3104 18.2844 10.5279 16.853C9.7252 15.3848 8.65247 14.2995 7.14272 13.4727C5.70903 12.6875 4.99219 12.2949 4.99219 11.9964C4.99219 11.6978 5.70903 11.3052 7.14272 10.52C8.65247 9.69316 9.7252 8.60787 10.5279 7.13967Z"/></svg>';
    const shade = (hexColor, k) => {   // k < 1 darkens, k > 1 lightens toward white
      const [r, g, b] = hexColor.match(/\w\w/g).map((h) => parseInt(h, 16));
      const f = (c) => Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1));
      return `rgb(${f(r)},${f(g)},${f(b)})`;
    };
    // Old .Button: color by (color, theme); style decides fill, outline or text
    const OLD = {
      light: { primary: "#2B4C7E", neutral: "#0F2138", danger: "#C42B2B", paper: "#FFFFFF", disabled: ["#E3E7EC", "#9AA3AE"] },
      dark:  { primary: "#B8F05A", neutral: "#FFFFFF", danger: "#F27777", paper: "#0B1F3A", disabled: ["#33425A", "#8A94A3"] },
    };
    // New Button: one palette per style, [fill, text, border]
    const NEW = {
      primary: ["#2F5FA0", "#FFFFFF", "#2F5FA0"], secondary: ["#0B1F3A", "#FFFFFF", "#0B1F3A"],
      "ghost-primary": ["transparent", "#2F5FA0", "#2F5FA0"], "ghost-secondary": ["transparent", "#0B1F3A", "#0B1F3A"],
      neutral: ["#F4F5F7", "#0B1F3A", "#D8DCE2"], danger: ["#C42B2B", "#FFFFFF", "#C42B2B"],
      brand: ["#C7F26B", "#0B1F3A", "#C7F26B"], action: ["#1E7A4D", "#FFFFFF", "#1E7A4D"],
    };
    const NEW_NAVY = { "ghost-primary": ["transparent", "#CFE0FF", "#CFE0FF"], "ghost-secondary": ["transparent", "#FFFFFF", "#FFFFFF"], neutral: ["rgba(255,255,255,.12)", "#FFFFFF", "rgba(255,255,255,.28)"], secondary: ["#FFFFFF", "#0B1F3A", "#FFFFFF"] };

    root.querySelectorAll("[data-side]").forEach((side) => {
      const form = $(".config-form", side), spec = $(".spec", side), box = $(".specimen", side);
      if (!form || !spec || !box) return;
      // names are prefixed by side, so the two sides' radios never share a group
      const v = (name) => { const el = form.querySelector(`input[name="${side.dataset.side}-${name}"]:checked`); return el ? el.value : ""; };
      const on = (name) => !!form.querySelector(`input[name="${side.dataset.side}-${name}"]:checked`);
      const paint = () => {
        const isOld = side.dataset.side === "old";
        const size = v("size") || "medium", state = v("state") || "default";
        let fill, text, border, label = "Click me", left = false, right = false, iconOnly = false, navy = false;
        if (isOld) {
          const theme = v("theme") === "dark" ? "dark" : "light", pal = OLD[theme], color = pal[v("color")] || pal.primary, style = v("style") || "solid";
          navy = theme === "dark";
          const icon = v("icon");
          left = icon === "left"; right = icon === "right"; iconOnly = icon === "only";
          if (style === "solid") { fill = color; text = theme === "dark" ? "#0B1F3A" : "#FFFFFF"; border = color; }
          else if (style === "ghost") { fill = "transparent"; text = color; border = color; }
          else { fill = "transparent"; text = color; border = "transparent"; }
          if (state === "disabled") { [fill, text] = style === "solid" ? pal.disabled : ["transparent", pal.disabled[1]]; border = style === "ghost" ? pal.disabled[0] : fill; }
          spec.classList.toggle("fixed", v("fixed") === "yes");
          spec.classList.toggle("st-link", style === "link");
        } else {
          navy = v("navy") === "yes";
          const style = v("style") || "primary";
          [fill, text, border] = (navy && NEW_NAVY[style]) || NEW[style] || NEW.primary;
          left = on("left"); right = on("right");
          if (state === "disabled") { fill = navy ? "#33425A" : "#E3E7EC"; text = navy ? "#8A94A3" : "#9AA3AE"; border = fill; }
          spec.classList.remove("fixed", "st-link");
        }
        if (state === "hover" && fill !== "transparent" && !fill.startsWith("rgba")) fill = shade(fill, navy && fill !== "#FFFFFF" ? 1.08 : .9);
        if (state === "active" && fill !== "transparent" && !fill.startsWith("rgba")) fill = shade(fill, navy && fill !== "#FFFFFF" ? 1.16 : .8);
        spec.style.background = fill; spec.style.color = text; spec.style.borderColor = border;
        spec.className = spec.className.replace(/\bs-\w+/g, "").trim() + ` s-${size}`;
        spec.classList.toggle("icon-only", iconOnly);
        spec.classList.toggle("focused", state === "focused");
        spec.style.setProperty("--specimen-bg", navy ? "#0B1F3A" : cssVar("--plate-paper", "#F6F4F0"));
        spec.innerHTML = iconOnly ? SPARK : `${left ? SPARK : ""}<span>${label}</span>${right ? SPARK : ""}`;
        box.classList.toggle("navy", navy);
      };
      form.addEventListener("change", paint);
      paint();
    });
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
      : EASE;
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
      const wait = Number(el.dataset.flowDelay || 0) * 120;   // a row of figures rolls in one after another
      let done = false;
      const settle = (animate) => {
        if (done) return;
        done = true;
        cols.forEach((c, i) => {
          const end = `translateY(${-(10 + c.n)}em)`;     // one full turn, then the digit
          if (animate) {
            c.strip.animate([{ transform: "translateY(0)" }, { transform: end }],
              { duration: 1100, delay: 200 + i * 45 + wait, easing: flowEase, fill: "both" })
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
        s.setAttribute("aria-label", s.dataset.stripLabel || "Screens, scroll sideways");
      } else { s.removeAttribute("tabindex"); s.removeAttribute("aria-label"); if (s.tagName !== "FIGURE") s.removeAttribute("role"); }
    });
    stops();
    window.addEventListener("resize", debounce(stops, 120));
    window.addEventListener("load", stops);
  };

  /* ---- Table frames ----
     A table wider than its frame scrolls sideways, so the frame gets a tab
     stop the same way, only while it actually overflows: checked as the frame
     or its table changes size (the viewport, a details opening, the fonts
     arriving). Under 640px the rows stack (styles.css, section 11), nothing
     scrolls, and the stop goes. A frame the markup names keeps its name; any
     other is a group named for the reader who lands on it. A tabindex="0" in
     the markup stands for a browser without the observer. */
  const initTableWraps = () => {
    if (!("ResizeObserver" in window)) return;
    $$(".table-wrap").forEach((w) => {
      const named = w.hasAttribute("aria-label") || w.hasAttribute("aria-labelledby");
      const ro = new ResizeObserver(() => {
        if (w.scrollWidth > w.clientWidth + 1) {
          w.tabIndex = 0;
          if (!named) { w.setAttribute("role", "group"); w.setAttribute("aria-label", "Table, scroll sideways"); }
        } else {
          w.removeAttribute("tabindex");
          if (!named) { w.removeAttribute("role"); w.removeAttribute("aria-label"); }
        }
      });
      ro.observe(w);
      const table = $("table", w);
      if (table) ro.observe(table);
    });
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

  /* ---- Time on page ----
     A clock of how long this page has been looked at. It runs while the tab
     is in view and the reader has done something in the last five minutes,
     and pauses otherwise, so a tab left open behind another does not count.
     Once a minute, and as the page is hidden or left, the seconds so far go
     to /api/ping in a beacon; the middleware keeps them beside the visit and
     the dashboard reads how long each visit and session lasted from them.
     Nothing is sent that the page view itself did not already carry. */
  const initClock = () => {
    if (!("sendBeacon" in navigator)) return;
    const IDLE = 5 * 60000, BEAT = 60000;
    let banked = 0;                 // ms already counted from earlier stretches in view
    let since = 0;                  // when the current stretch began; 0 while paused
    let sent = -1, last = 0, idle = 0;
    const visible = () => document.visibilityState === "visible";
    const seconds = () => Math.round((banked + (since ? Date.now() - since : 0)) / 1000);
    const send = () => {
      const secs = seconds();
      if (secs === sent) return;
      sent = secs;
      navigator.sendBeacon("/api/ping", JSON.stringify({ page: location.pathname, secs }));
    };
    const pause = () => { if (since) { banked += Date.now() - since; since = 0; } };
    const resume = () => { if (!since && visible()) since = Date.now(); };
    const touch = () => {           // any sign of the reader keeps the clock running for another five minutes
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      resume();
      clearTimeout(idle);
      idle = setTimeout(() => { pause(); send(); }, IDLE);
    };
    ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"].forEach((ev) => document.addEventListener(ev, touch, { passive: true }));
    document.addEventListener("visibilitychange", () => { if (visible()) { last = 0; touch(); } else { pause(); send(); } });
    window.addEventListener("pagehide", () => { pause(); send(); });
    window.addEventListener("pageshow", () => { last = 0; touch(); });   // back from the bfcache: a new stretch
    setInterval(() => { if (since) send(); }, BEAT);
    touch();
  };

  /* ---- Arcade: "Nine holes" ----
     A one-button golf game on the last screen. The canvas is a pixel grid, 64
     tall and as wide as the block allows at a whole-number scale (4 CSS px a
     pixel, 3 on a phone), so every sprite pixel stays square. Each hole puts
     the cup somewhere to the right, a wind, and on most holes a bunker or a
     pond between. One press stops the swinging aim arrow, the next stops the
     power meter and hits; the ball flies, bounces and rolls, and drops when
     it crosses the cup slowly enough. Once the ball stops within a few steps
     of the cup it's a putt: no arrow, one press rolls it, and a putt struck
     too firm runs past. Nine holes, par 3 each; the best round
     is kept in localStorage, and a finished round can be posted by name to
     the shared leaderboard (/api/scores), whose top five the start screen
     draws: beside the title when there is room, in turn with it when there
     is not (or in place of it, for reduced motion). Anything can press it: the button's click
     (Enter, tap, mouse), or Space and the up arrow on keydown. The loop runs
     only while something moves, and pauses when the block leaves the screen
     or the tab is hidden. Sprites are strings: 1 is ink, 2 accent. */
  const initArcade = () => {
    const root = $(".arcade");
    const btn = root && $(".arcade-screen", root);
    const c = root && $("canvas", root);
    if (!root || !btn || !c || !c.getContext) return;
    const ctx = c.getContext("2d");
    const bestWrap = $(".arcade-score", root), best = $("[data-best]", root), status = $(".arcade-status", root);
    const list = $(".arcade-board", root), post = $(".arcade-post", root);
    const nameIn = post && $("input", post), postBtn = post && $("button", post), note = post && $(".arcade-post-note", post);
    // The screen's sand holds in both registers, as a panel's does, so the
    // course is drawn in the plate's inks, which hold too.
    const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const INK = tok("--plate-ink-0") || "#14100C", INK3 = tok("--plate-ink-2") || "#6F675D", HAIR = tok("--plate-hair-2") || "#CFC9BF";
    const ACCENT = tok("--plate-accent") || "#3B6B44", GREEN = tok("--plate-accent-2") || "#6E9A5A", FLAG = tok("--plate-danger") || "#C0392B", SAND = tok("--plate-surface") || "#FFFFFF";
    const H = 64, GROUND = 52, TEE = 12;           // logical pixels; the ground line is GROUND
    /* The tunable part, which the dashboard sets (GAME in middleware.js has
       the same defaults and the limits). /api/scores hands the saved values
       over with the board; a change arriving mid-round waits for the next. */
    let HOLES = 9, PAR = 3, CUP = 5, PUTT = 28, WIND = 25, AIM = 1.4, POWER = 1.0, HAZARDS = 0.65, pending = null;
    let W = 192, scale = 4;

    /* Sprites: the golfer at address, at the top of the backswing, and after the hit */
    const GOLFER = [
      ["..11....", "..11....", "...1....", "..222...", ".2222.1.", "..22..1.", "..22..1.", "..1.1.1.", "..1.1.1.", ".11.11.1"],
      ["1...11..", ".1..11..", "..1..1..", "..1222..", "...2222.", "..22....", "..22....", "..1.1...", "..1.1...", ".11.11.."],
      ["..11...1", "..11..1.", "...1.1..", "..2221..", ".2222...", "..22....", "..22....", "..1.1...", "..1.1...", ".11.11.."],
    ];
    const CLOUD = ["..111..", ".11111.", "1111111"];
    /* A 3×5 pixel face for the words on screen; the site's faces stay in the DOM */
    const FONT = {
      A: "010101111101101", B: "110101110101110", C: "111100100100111", D: "110101101101110", E: "111100110100111",
      F: "111100110100100", J: "001001001101111", Q: "111101101111011", Z: "111001010100111",
      G: "111100101101111", H: "101101111101101", I: "111010010010111", K: "101101110101101", L: "100100100100111",
      M: "101111111101101", N: "110101101101101", O: "111101101101111", P: "111101111100100", R: "111101110101101",
      S: "111100111001111", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101101111101",
      X: "101101010101101", Y: "101101010010010",
      0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
      5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111",
      " ": "000000000000000", "+": "000010111010000", "-": "000000111000000", "<": "001010100010001", ">": "100010001010100",
    };
    const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
    const sprite = (art, x, y, col, flip = false) => art.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== ".") px(x + (flip ? row.length - 1 - i : i), y + j, row[i] === "2" ? ACCENT : col);
    });
    const text = (str, x, y, col, size = 1) => {
      ctx.fillStyle = col;
      Array.from(str).forEach((ch, n) => {
        const g = FONT[ch] || FONT[" "];
        for (let k = 0; k < 15; k++) if (g[k] === "1") ctx.fillRect(x + (n * 4 + (k % 3)) * size, y + Math.floor(k / 3) * size, size, size);
      });
    };
    const width = (str, size = 1) => (str.length * 4 - 1) * size;
    const centre = (str, y, col, size = 1, mid = W / 2) => text(str, Math.floor(mid - width(str, size) / 2), y, col, size);

    /* State */
    const G = 220, FRICTION = 70, BOUNCE = 0.45;   // px/s²; px/s²; how much of a landing comes back up
    const PUTT_V = 92, PUTT_DROP = 55;             // within PUTT px of the cup it's a putt: rolled, at most ~60px, and too firm lips out
    let state = "idle";                            // idle | aim | power | fly | holed | over
    let paused = false, raf = 0, last = 0, clock = 0;
    let hole = 0, strokes = 0, total = 0, cup = 0, wind = 0, hazard = null, holeStroke = 0;
    let ball = { x: TEE, y: GROUND - 2, vx: 0, vy: 0 }, from = TEE, angle = 45, power = 0, pose = 0, putting = false;
    let clouds = [], tufts = [];
    let hi = 0;
    let leaders = [], boardOn = false, taking = true, mine = -1, attract = false, posted = false;   // the shared board, and this round's place on it
    const BW = 64;                                 // the board's width: place, a ten-letter name, strokes
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { hi = Number(localStorage.getItem("golf-best")) || 0; } catch (e) { /* private mode */ }
    const showBest = () => { if (hi) { best.textContent = String(hi); bestWrap.hidden = false; } };
    showBest();
    const rand = (a, b) => a + Math.random() * (b - a);
    const seed = () => {
      clouds = Array.from({ length: Math.max(2, Math.round(W / 70)) }, () => ({ x: rand(0, W), y: rand(4, 22) }));
      tufts = Array.from({ length: Math.round(W / 7) }, () => Math.floor(rand(0, W)));
    };
    const say = (m) => { if (status) status.textContent = m; };
    const NAMES = { "-3": "ALBATROSS", "-2": "EAGLE", "-1": "BIRDIE", 0: "PAR", 1: "BOGEY", 2: "DOUBLE", 3: "TRIPLE" };
    const named = (n) => (n === 1 ? "ACE" : NAMES[n - PAR] || "OUCH");
    const COUNT = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN"];
    const title = () => `${COUNT[HOLES] || HOLES} HOLE${HOLES === 1 ? "" : "S"}`;
    const bestKey = () => (HOLES === 9 && PAR === 3 ? "golf-best" : `golf-best-${HOLES}x${PAR}`);   // a best only stands against rounds of the same length
    const apply = (st) => {
      if (!st) return;
      if (state !== "idle" && state !== "over") { pending = st; return; }
      pending = null;
      HOLES = st.holes; PAR = st.par; CUP = st.cup; PUTT = st.putt; WIND = st.wind; AIM = st.aim; POWER = st.power; HAZARDS = st.hazards / 100;
      const words = title().charAt(0) + title().slice(1).toLowerCase();
      $$("[data-holes]", root).forEach((el) => (el.textContent = words));
      $$("[data-par]", root).forEach((el) => (el.textContent = String(HOLES * PAR)));
      btn.setAttribute("aria-label", `${words}, a golf game. Press to aim, press again to swing. Near the cup, one press putts.`);
      try { hi = Number(localStorage.getItem(bestKey())) || 0; } catch (e) { hi = 0; }
      bestWrap.hidden = !hi; showBest();
    };
    const vmax = () => Math.sqrt((W - TEE) * 1.15 * G);   // full power carries a little past the far edge
    const dir = () => (ball.x + 1 > cup ? -1 : 1);         // past the cup, the golfer turns and hits back

    const layHole = () => {
      strokes = 0;
      cup = Math.round(rand(W * 0.55, W * 0.92));
      wind = Math.round(rand(-WIND, WIND));
      const kind = Math.random();
      if (kind >= HAZARDS || W < 120) hazard = null;
      else {
        const w = Math.round(rand(12, 22)), x = Math.round(rand(TEE + 24, cup - w - 12));
        hazard = { kind: kind < HAZARDS * 0.55 ? "sand" : "water", x, w };
      }
      ball = { x: TEE, y: GROUND - 2, vx: 0, vy: 0 };
      from = TEE; pose = 0; clock = 0; putting = false;
      state = "aim";
    };
    const hit = () => {
      if (putting) { ball.vx = (8 + power * (PUTT_V - 8)) * dir(); ball.vy = 0; }   // along the ground, no loft
      else {
        const v = 30 + power * (vmax() - 30), a = (angle * Math.PI) / 180;
        ball.vx = Math.cos(a) * v * dir(); ball.vy = -Math.sin(a) * v;
      }
      from = ball.x; strokes++; total++; pose = 2;
      state = "fly";
    };
    const inHazard = (x) => hazard && x >= hazard.x && x <= hazard.x + hazard.w;
    const settle = () => {                         // the ball has stopped: back to aiming, or straight to the putter when it's close
      ball.vx = 0; ball.vy = 0; ball.y = GROUND - 2; pose = 0; clock = 0;
      putting = PUTT > 0 && Math.abs(ball.x + 1 - cup) <= PUTT && !inHazard(ball.x + 1);
      if (putting) { state = "power"; power = 0; say("On the green. Press to putt."); }
      else state = "aim";
    };
    const holed = () => {
      holeStroke = strokes; ball.y = GROUND; ball.vx = 0; ball.vy = 0;
      state = "holed";
      say(`Hole ${hole}. ${named(strokes).toLowerCase()}, ${strokes} ${strokes === 1 ? "stroke" : "strokes"}.`);
    };
    const finish = () => {
      state = "over";
      if (!hi || total < hi) { hi = total; showBest(); try { localStorage.setItem(bestKey(), String(hi)); } catch (e) { /* fine */ } }
      say(`Round over. ${total} strokes, par ${HOLES * PAR}. Best ${hi}.${boardOn && taking ? " Add your name below to post it to the leaderboard." : ""}`);
      if (boardOn && taking && post) {
        posted = false; post.hidden = false; nameIn.parentElement.hidden = false; nameIn.labels[0].hidden = false; note.textContent = "";
        nameIn.removeAttribute("aria-invalid"); postBtn.disabled = false;
        if (!nameIn.value) try { nameIn.value = localStorage.getItem("golf-name") || ""; } catch (e) { /* private mode */ }
      }
    };

    /* The leaderboard: read once on load, replaced by what a post returns */
    const ordinal = (n) => `${n}${["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th"}`;
    const setBoard = (rows) => {
      leaders = Array.isArray(rows) ? rows.slice(0, 5) : [];
      if (!list) return;
      list.replaceChildren(...leaders.map((r) => { const li = document.createElement("li"); li.textContent = `${r.name}, ${r.score} strokes`; return li; }));
      list.hidden = !leaders.length;
    };
    fetch("/api/scores", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!d) return; apply(d.settings); if (d.configured) { boardOn = true; taking = !d.settings || d.settings.open; setBoard(d.scores); } frame(); })
      .catch(() => { /* no board: the game plays on its own */ });
    const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ");
    if (post) {
      nameIn.addEventListener("input", () => { const v = clean(nameIn.value); if (v !== nameIn.value) nameIn.value = v; nameIn.removeAttribute("aria-invalid"); });
      post.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = clean(nameIn.value).trim();
        if (!name) { nameIn.setAttribute("aria-invalid", "true"); note.textContent = "Add a letter or a number."; nameIn.focus(); return; }
        if (posted) return;
        postBtn.disabled = true; note.textContent = "Posting…";
        fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, score: total }) })
          .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (!ok) throw new Error(d.error || "The board isn't answering");
            posted = true;
            try { localStorage.setItem("golf-name", name); } catch (err) { /* fine */ }
            setBoard(d.scores);
            mine = d.rank && d.rank <= leaders.length ? d.rank - 1 : -1;
            note.textContent = d.rank ? `Posted. ${name} is ${ordinal(d.rank)} on the leaderboard with ${total}.` : `Posted, though ${total} is outside the top 100.`;
            nameIn.parentElement.hidden = true; nameIn.labels[0].hidden = true;
            btn.focus({ preventScroll: true });
            state = "idle"; attract = true; frame();
          })
          .catch((err) => { postBtn.disabled = false; note.textContent = `${err.message}.`; });
      });
    }

    /* Drawing */
    const scene = () => {
      ctx.clearRect(0, 0, W, H);
      clouds.forEach((k) => sprite(CLOUD, Math.round(k.x), Math.round(k.y), HAIR));
      tufts.forEach((x) => px(x, GROUND - 1, GREEN));
      ctx.fillStyle = ACCENT; ctx.fillRect(0, GROUND, W, 1);
      if (hazard) {
        ctx.fillStyle = hazard.kind === "sand" ? SAND : HAIR;
        ctx.fillRect(hazard.x, GROUND, hazard.w, 3);
        for (let x = hazard.x + 1; x < hazard.x + hazard.w - 1; x += 3) px(x, GROUND + 1 + (x % 2), INK3);   // grains, or ripples
      }
      // the cup: a gap in the line CUP px wide with ink walls and floor, and the flag beside it
      const r = CUP >> 1;
      ctx.clearRect(cup - r, GROUND, CUP, 3);
      ctx.fillStyle = INK; ctx.fillRect(cup - r - 1, GROUND, 1, 3); ctx.fillRect(cup + r + 1, GROUND, 1, 3); ctx.fillRect(cup - r, GROUND + 3, CUP, 1);
      ctx.fillRect(cup + r + 1, GROUND - 12, 1, 12);
      ctx.fillStyle = FLAG; ctx.fillRect(cup + r + 2, GROUND - 12, 3, 2); ctx.fillRect(cup + r + 2, GROUND - 10, 2, 1);
      if (state !== "idle" && state !== "over") {
        if (state !== "fly") { const left = dir() < 0; sprite(GOLFER[pose], Math.round(ball.x) + (left ? 2 : -8), GROUND - 10, INK, left); }
        if (state !== "holed") { ctx.fillStyle = INK; ctx.fillRect(Math.round(ball.x), Math.max(0, Math.round(ball.y)), 2, ball.y < 0 ? 1 : 2); }   // above the frame, a mark at the top
        text(`HOLE ${hole}`, 4, 4, INK);
        const s = `STROKE ${strokes}`; text(s, W - 4 - width(s), 4, INK);
        if (putting && state !== "fly") centre("PUTT", 4, INK3);
        else {
          const gust = Math.min(3, Math.round(Math.abs(wind) / 8));
          const arrows = (wind < 0 ? "<" : ">").repeat(gust) || "-";
          centre(`WIND ${arrows}`, 4, INK3);
        }
      }
      if (state === "aim") {                       // the arrow from the ball, four dots long
        const a = (angle * Math.PI) / 180;
        for (let i = 3; i <= 12; i += 3) px(Math.round(ball.x + 1 + Math.cos(a) * i * dir()), Math.round(ball.y + 1 - Math.sin(a) * i), INK);
      }
      if (state === "power" && putting) {          // the line of the putt, three dots along the ground
        for (let i = 4; i <= 12; i += 4) px(Math.round(ball.x + 1 + i * dir()), GROUND - 1, INK3);
      }
      if (state === "power") {                     // the meter under the wind
        const w = 32, x = Math.floor((W - w) / 2);
        ctx.fillStyle = HAIR; ctx.fillRect(x, 12, w, 3);
        ctx.fillStyle = ACCENT; ctx.fillRect(x, 12, Math.round(w * power), 3);
      }
    };
    const leaderRows = (x, y) => {
      text("LEADERS", x, y, INK3);
      leaders.forEach((r, i) => {
        const row = y + 8 + i * 8, col = i === mine ? ACCENT : INK, sc = String(r.score);
        text(String(i + 1), x, row, INK3); text(r.name, x + 7, row, col); text(sc, x + BW - width(sc), row, col);
      });
    };
    const idle = () => {
      hazard = null;
      const board = boardOn && leaders.length;
      if (board && W >= 200) {                     // room for both: the title left, the board right, the flag between
        const bx = W - 8 - BW;
        cup = bx - 16; scene();
        centre(title(), 14, INK, 2, (bx - 14) / 2); centre("PRESS TO PLAY", 30, INK3, 1, (bx - 14) / 2);
        leaderRows(bx, 6);
      } else if (board && (attract || calm)) {     // narrow: the board on its own, the flag off screen
        cup = -20; scene();
        leaderRows(Math.floor((W - BW) / 2), 6);
      } else { cup = Math.round(W * 0.8); scene(); centre(title(), 14, INK, 2); centre("PRESS TO PLAY", 30, INK3); }
    };
    /* On a narrow screen the start screen shows the title and the board in
       turn, every five seconds; any press ends it by starting a round. */
    setInterval(() => {
      if (state !== "idle" || paused || calm || document.hidden || !boardOn || !leaders.length || W >= 200) return;
      attract = !attract; frame();
    }, 5000);
    const holedFrame = () => { scene(); centre(named(holeStroke), 14, INK, 2); centre(hole < HOLES ? "PRESS FOR NEXT" : "PRESS FOR SCORE", 30, INK3); };
    const overFrame = () => {
      scene();
      const d = total - HOLES * PAR, diff = d === 0 ? "EVEN" : d > 0 ? `+${d}` : `${d}`;
      centre(`ROUND ${total}`, 14, INK, 2);
      centre(`PAR ${HOLES * PAR}  ${diff}`, 30, INK3);
      centre("PRESS TO PLAY AGAIN", 40, INK3);
    };
    const pausedFrame = () => { scene(); centre("PAUSED", 22, INK, 2); };
    const frame = () => {
      if (paused) pausedFrame();
      else if (state === "idle") idle();
      else if (state === "holed") holedFrame();
      else if (state === "over") overFrame();
      else scene();
    };
    const moving = () => state === "aim" || state === "power" || state === "fly";

    /* Loop: runs while the arrow swings, the meter fills or the ball moves */
    const step = (t) => {
      raf = 0;
      if (!moving() || paused) return;
      const dt = Math.min(0.05, (t - last) / 1000) || 0;
      last = t; clock += dt;
      clouds.forEach((k) => { k.x += wind * 0.02 * dt; if (k.x < -8) k.x = W; if (k.x > W + 1) k.x = -7; });
      if (state === "aim") angle = 15 + 60 * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / AIM));
      if (state === "power") power = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / POWER);
      if (state === "fly") {
        ball.vy += G * dt;
        if (ball.y < GROUND - 2) ball.vx += wind * dt;
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 0) { ball.x = 0; ball.vx = Math.abs(ball.vx) * 0.3; }
        if (ball.x > W - 2) { ball.x = W - 2; ball.vx = -Math.abs(ball.vx) * 0.3; }
        const speed = Math.hypot(ball.vx, ball.vy);
        if (ball.y >= GROUND - 3 && Math.abs(ball.x + 1 - cup) <= CUP >> 1 && speed < (putting ? PUTT_DROP : 90)) { holed(); frame(); return; }
        if (ball.y >= GROUND - 2) {
          ball.y = GROUND - 2;
          if (inHazard(ball.x + 1)) {
            if (hazard.kind === "water") {       // a penalty stroke and back to where it was hit from
              strokes++; total++; ball.x = from; say("Water. One penalty stroke.");
            }
            settle();                             // sand stops it dead; the loop carries on for the aim
          }
          if (ball.vy > 30) { ball.vy = -ball.vy * BOUNCE; ball.vx *= 0.7; }
          else {
            ball.vy = 0;
            const f = FRICTION * dt;
            ball.vx = Math.abs(ball.vx) <= f ? 0 : ball.vx - Math.sign(ball.vx) * f;
            if (ball.vx === 0) settle();
          }
        }
      }
      scene();
      raf = requestAnimationFrame(step);
    };
    const run = () => { if (!raf && moving() && !paused) { last = performance.now(); raf = requestAnimationFrame(step); } };
    const act = () => {
      if (paused) { paused = false; run(); return; }
      if (state === "idle" || state === "over") {
        if (pending) { const st = pending; state = "idle"; apply(st); }
        hole = 1; total = 0; mine = -1; attract = false; layHole(); say("Hole 1. Press to aim, press to swing.");
        if (post) post.hidden = true;
      }
      else if (state === "aim") { state = "power"; clock = 0; power = 0; pose = 1; }
      else if (state === "power") hit();
      else if (state === "holed") { if (hole < HOLES) { hole++; layHole(); say(`Hole ${hole}.`); } else finish(); }
      frame(); run();
    };
    const setPaused = (on) => {
      if (!moving() || paused === on) return;
      paused = on;
      if (on) { if (raf) cancelAnimationFrame(raf); raf = 0; frame(); } else run();
    };

    /* Input: pointerdown covers tap and mouse; Space, Enter and the up arrow
       act on keydown and are swallowed there, so Space neither scrolls the
       page nor fires the button's own click on keyup. The click handler is
       left for clicks made without a pointer or a key (assistive tech).
       A tap's own click arrives with detail 0 too (Chromium, once its
       pointerdown is prevented), so a click that follows a pointer press
       within a second and a half is that press's, already acted on. */
    let pressed = -1e6;
    btn.addEventListener("click", (e) => { if (e.detail === 0 && performance.now() - pressed > 1500) act(); });
    btn.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.preventDefault(); pressed = performance.now(); btn.focus({ preventScroll: true }); act(); } });
    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "Enter") { e.preventDefault(); if (!e.repeat) act(); }
    });
    btn.addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); });

    /* Size: as wide as the button at a whole-number scale, redrawn on change.
       A hole laid for another width is re-laid so the cup stays on screen. */
    const size = () => {
      const box = btn.clientWidth - 2;             // inside the hairline border
      scale = box < 600 ? 3 : 4;
      W = Math.max(96, Math.floor(box / scale));
      c.width = W; c.height = H;
      c.style.width = `${W * scale}px`; c.style.height = `${H * scale}px`;
      seed();
      if (state === "idle" || state === "over" || cup > W - 8) { if (state !== "idle" && state !== "over") layHole(); else cup = Math.round(W * 0.8); }
      frame();
    };
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(btn); else { size(); window.addEventListener("resize", size); }

    /* Pause off screen and in a background tab */
    if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => setPaused(!en.isIntersecting), { threshold: 0.4 }).observe(btn);
    document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
  };

  /* ---- The featured stack ----
     After uselayouts.com's stack scroll reveal. The home page's three case
     studies are cards in a deck that sticks in the middle of the screen
     while its track scrolls past (styles.css, .stack.on). Each card but the
     last peels up and back over its own stretch of the track, and the cards
     behind step forward as it goes, so the deck reads one card at a time.
     Keyboard focus on a card behind scrolls to where it is at the front.
     Under reduced motion the script leaves the cards in their column. The
     lens re-sorts the deck and says "lens"; the pile is redrawn in the new
     order.
     A jump to a section (the bar's Leadership and About, a search result, a
     cited source, or another page's link arriving here) would scroll the
     whole track and peel every card on the way, so the deck passes as one
     block instead: for the length of the jump the track keeps only the deck
     and whatever of its empty stretch is on screen (styles.css,
     .stack.whole), the cards hold still, and the page moves by what was
     taken out, so nothing on screen shifts. Once the scroll has settled
     and the page has loaded, the track grows back the same way, as soon as
     the deck is out of sight or would look no different. */
  const initStack = () => $$("[data-stack]").forEach((stack) => {
    const track = $(".stack-track", stack), deck = $(".stack-deck", stack);
    if (reduced || !track || !deck) return;
    const PEEK = 18, TILT = 15;
    const PEELS = [[0.1, 0.44], [0.56, 0.9]];   // each card's stretch of the track; the last card has none and stays
    let cards = [], whole = null;               // whole: while a jump passes, the progress the cards hold at
    stack.classList.add("on");
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const measure = () => {
      const r = track.getBoundingClientRect(), h = deck.getBoundingClientRect().height;   // not offsetHeight: a deck sized in vh is a fraction of a pixel off whole
      return { r, h, top: parseFloat(getComputedStyle(deck).top) || 0 };
    };
    let raf = 0;
    const draw = () => {
      raf = 0;
      const { r, h, top } = measure();
      const p = whole ? whole.p : clamp01((top - r.top) / Math.max(1, r.height - h));   // 0 as the deck sticks, 1 as it lets go
      const lift = -(h + (window.innerWidth < 768 ? 140 : 220));
      const peel = PEELS.map(([a, b]) => clamp01((p - a) / (b - a)));
      cards.forEach((c, i) => {
        let depth = i;
        for (let k = 0; k < i && k < peel.length; k++) depth -= peel[k];   // how far back in the pile it sits
        const scale = depth <= 1 ? 1 - 0.04 * depth : 0.96 - 0.03 * (depth - 1);
        const t = i < cards.length - 1 && i < peel.length ? peel[i] : 0;
        c.style.zIndex = String(cards.length - i);
        c.style.transform = `translate3d(0, ${(PEEK * depth).toFixed(2)}px, 0) scale(${scale.toFixed(4)}) perspective(500px) translate3d(0, ${(t * lift).toFixed(1)}px, 0) rotateX(${(t * TILT).toFixed(2)}deg)`;
        c.style.visibility = t >= 1 ? "hidden" : "";   // gone off the top: out of sight and out of the tab order
      });
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const order = () => {
      cards = $$(".stack-card", deck);
      cards.forEach((c, i) => { $(".stack-n", c).textContent = `${String(i + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`; });
      draw();   // at once, so a lens transition captures the pile in its new order
    };
    // How much of the track's empty stretch shows above and below the deck,
    // with the track's top at t on screen, the deck's at d and its foot at b.
    const room = (t, d, b, h) => {
      const vh = window.innerHeight;
      return { above: Math.max(0, Math.min(d, vh) - Math.max(t, 0)), below: Math.max(0, Math.min(b, vh) - Math.max(d + h, 0)) };
    };
    // The full track with its top at t on screen: how far the deck has come
    // down it (where the sticky rule holds it) and what shows around it.
    const full = (t, r, h, top) => {
      const E = r.height - h, o = Math.max(0, Math.min(E, top - t));
      return { p: E > 0 ? o / E : 0, ...room(t, t + o, t + r.height, h) };
    };
    const root = document.documentElement;
    const anchorless = (fn) => {   // the browser's own scroll anchoring would move the page a second time
      root.style.overflowAnchor = "none";
      fn();
      requestAnimationFrame(() => { root.style.overflowAnchor = ""; });
    };
    let settling = 0;
    const later = () => { clearTimeout(settling); settling = setTimeout(() => settle(false), 200); };
    // Makes the deck one block for a jump to `to`, or to the scroll position
    // `at` when that is given, and returns where that position is on the
    // shrunk page (null when the jump never brings the deck on screen).
    const pass = (to, at) => {
      if (whole) { later(); return null; }
      const vh = window.innerHeight, { r, h, top } = measure(), y0 = window.scrollY;
      const aim = at != null ? at : to ? y0 + to.getBoundingClientRect().top - (parseFloat(getComputedStyle(to).scrollMarginTop) || 0) : 0;
      const land = Math.max(0, Math.min(root.scrollHeight - vh, aim));
      const t1 = r.top + y0 - land;                                                               // the track's top on screen where the jump lands
      if (Math.max(r.top, t1) <= -r.height || Math.min(r.top, t1) >= vh) return null;            // the jump never brings it on screen
      const d = deck.getBoundingClientRect().top;
      const now = r.bottom > 0 && r.top < vh, there = t1 < vh && t1 + r.height > 0;
      // The block it passes as: the deck as it shows now, or else as it will
      // show where the jump lands, or else at rest with its pile behind it.
      const hold = now ? full(r.top, r, h, top) : there ? full(t1, r, h, top) : { p: 0, above: 0, below: 0 };
      // The page scrolls in whole pixels, so the scroll that keeps the deck
      // put and the height taken out must be whole too, or what shows would
      // land a fraction off. The fractions stay in the track, at whichever
      // end is off screen.
      if (now && r.top < 0) { const dy = r.top + hold.above - d; hold.above += Math.ceil(dy) - dy; }
      const cut = r.height - h - hold.above - hold.below, spare = cut - Math.floor(cut);
      if ((!now && there ? t1 : r.top) + r.height > vh) hold.below += spare; else hold.above += spare;
      anchorless(() => {
        stack.style.setProperty("--whole-above", `${hold.above}px`);
        stack.style.setProperty("--whole-below", `${hold.below}px`);
        stack.classList.add("whole");
        whole = { p: hold.p };
        const c = track.getBoundingClientRect();   // its top has not moved: nothing above it changed
        const dy = now ? c.top + hold.above - d : r.bottom <= 0 ? c.bottom - r.bottom : 0;   // the deck stays put, or else what follows the track does
        if (dy) window.scrollTo({ top: window.scrollY + dy, behavior: "instant" });
      });
      draw();
      later();
      // The landing on the shrunk page: unmoved above the track, moved up by
      // what was taken out below it, and where the deck shows, so that it
      // shows in the same place.
      const cut2 = r.height - track.getBoundingClientRect().height, T = r.top + y0;
      const shrunk = t1 >= vh ? land : t1 + r.height <= 0 ? land - cut2 : T - (t1 + Math.max(0, Math.min(r.height - h, top - t1)) - hold.above);
      return Math.max(0, Math.min(root.scrollHeight - vh, shrunk));
    };
    const settle = (force) => {
      if (!whole) return;
      if (!force && document.readyState !== "complete") { window.addEventListener("load", later, { once: true }); return; }
      const vh = window.innerHeight, h = deck.getBoundingClientRect().height, was = whole.p;
      const c = track.getBoundingClientRect(), d = deck.getBoundingClientRect().top;
      const seen = room(c.top, d, c.bottom, h);
      anchorless(() => {
        stack.classList.remove("whole");
        const { r, top } = measure(), E = r.height - h;   // r.top is c.top: nothing above it changed
        // Where the full track's top goes: anywhere while it is below the
        // screen, so that what follows it stays put while it is above, and
        // so that the deck stays put while it shows.
        const t = c.top >= vh ? c.top : c.bottom <= 0 ? c.bottom - r.height : d > top + 0.5 ? d : d < top - 0.5 ? d - E : top - was * E;
        const f = full(t, r, h, top);
        if (!force && c.top < vh && c.bottom > 0 && (Math.abs(f.above - seen.above) > 1 || Math.abs(f.below - seen.below) > 1 || Math.abs(f.p - was) > 0.001)) {
          stack.classList.add("whole");   // growing back here would show: wait until the deck is off screen
          return;
        }
        whole = null;
        stack.style.removeProperty("--whole-above");
        stack.style.removeProperty("--whole-below");
        if (Math.abs(c.top - t) > 0.5) window.scrollTo({ top: window.scrollY + c.top - t, behavior: "instant" });
      });
      draw();
    };
    deck.addEventListener("lens", order);
    deck.addEventListener("focusin", (e) => {
      const i = cards.indexOf(e.target.closest(".stack-card"));
      if (i < 0) return;
      settle(true);   // a jump's single block grows back first, so the place below is there to scroll to
      const { r, h, top } = measure();
      const at = i === 0 ? 0 : (PEELS[i - 1][1] + (PEELS[i] ? PEELS[i][0] : 1)) / 2;   // between its predecessor's peel and its own
      window.scrollTo({ top: window.scrollY + r.top - top + at * (r.height - h), behavior: "instant" });   // not smooth: it follows the focus, which has already moved
    });
    // Back and Forward: the browser would scroll back to where the reader
    // was, smoothly, through the whole track. So the page restores places
    // itself: each entry of the history keeps its own, noted as the scroll
    // comes to rest (never while the track is shrunk, and just before a
    // link jumps away), and a step back or forward goes there with the deck
    // as one block. A reload, or a step back that loads the page afresh,
    // lands there at once, as the browser would have.
    let noting = 0;
    const note = () => {
      if (whole) return;
      const s = history.state && typeof history.state === "object" ? history.state : {};
      try { history.replaceState({ ...s, y: window.scrollY }, ""); } catch (_) {}
    };
    const kept = (state) => (state && typeof state === "object" && typeof state.y === "number" ? state.y : null);
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.addEventListener("pagehide", note);   // off to another page before the scroll came to rest
    window.addEventListener("popstate", (e) => {
      const y = kept(e.state), to = y === null && location.hash ? hashTarget(location.hash) : null;
      if (y === null && !to) return;   // nowhere noted: stay put
      settle(true);
      const shrunk = pass(to, y);
      if (shrunk !== null) window.scrollTo({ top: shrunk, behavior: "smooth" });
      else if (y !== null) window.scrollTo({ top: y, behavior: "smooth" });
      else to.scrollIntoView({ behavior: "smooth" });
    });
    window.addEventListener("scroll", () => {
      request();
      if (whole) later();
      clearTimeout(noting);
      noting = setTimeout(note, 250);
    }, { passive: true });
    window.addEventListener("resize", request);
    document.addEventListener("click", (e) => {   // a link to a section of this page, before the browser scrolls to it
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href*='#']");
      if (!a || (a.target && a.target !== "_self") || a.origin !== location.origin || a.pathname !== location.pathname || a.search !== location.search) return;
      const to = a.hash ? hashTarget(a.hash) : null;
      if (a.hash && !to) return;
      note();   // the entry being left keeps the place it is left from
      pass(to);
    });
    document.addEventListener("nav:jump", (e) => pass(e.detail));
    order();
    // Arriving from another page with a section in the address, the browser
    // scrolls there from the top once the page is in: one block then too.
    // A reload or a step back puts the reader back where they were instead.
    const arrival = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    const to = location.hash && hashTarget(location.hash), back = kept(history.state);
    if (to && !window.scrollY && (!arrival || arrival.type === "navigate")) pass(to);
    else if (back !== null && arrival && arrival.type !== "navigate") {
      const go = () => window.scrollTo({ top: back, behavior: "instant" });
      go();
      window.addEventListener("load", () => { if (Math.abs(window.scrollY - back) > 1 && !whole) go(); }, { once: true });   // fonts and images can move it before then
    }
  });

  /* ---- The LinkedIn button ----
     After uselayouts.com's get in touch (styles.css, .talk). A pointer over
     it, or keyboard focus on it, plays the meet: the label lifts away and
     the portrait and the You circle turn in and meet in the middle; 460ms
     later they overlap and "Let’s talk" writes in, the group kept centred.
     Leaving puts the label back. A tap only follows the link. Under reduced
     motion it goes straight to the last frame. */
  const initTalk = () => $$(".talk").forEach((btn) => {
    const face = $(".talk-face", btn), words = $(".talk-words", btn);
    if (!face || !words) return;
    let phase = "idle", timer = 0, hover = false, focus = false;
    const place = () => {
      const w = btn.clientWidth, f = face.offsetWidth;
      const x = phase === "meet" ? (w - (2 * f + 34)) / 2 : phase === "talk" ? (w - (2 * f - 10 + 12 + words.scrollWidth)) / 2 : 0;   // the pair (and the words) centred in the button
      btn.style.setProperty("--talk-x", `${Math.max(0, x - 5).toFixed(1)}px`);
    };
    const set = (p) => { phase = p; btn.dataset.phase = p; place(); };
    const start = () => {
      if (phase !== "idle") return;
      clearTimeout(timer);
      if (reduced) { set("talk"); return; }
      set("meet");
      timer = setTimeout(() => set("talk"), 460);
    };
    const end = () => { if (hover || focus) return; clearTimeout(timer); set("idle"); };
    btn.addEventListener("pointerenter", (e) => { if (e.pointerType !== "mouse") return; hover = true; start(); });
    btn.addEventListener("pointerleave", (e) => { if (e.pointerType !== "mouse") return; hover = false; end(); });
    btn.addEventListener("focus", () => { if (!btn.matches(":focus-visible")) return; focus = true; start(); });
    btn.addEventListener("blur", () => { focus = false; end(); });
    set("idle");
  });

  /* ---- The lens ----
     After the audience prompts on axoworks.com and pramit's intent card. A
     segmented control above a work list (or the home page's deck of cards)
     re-sorts its rows for the reader's role. The orders are fixed here
     (no model, nothing sent anywhere); the choice is kept in localStorage
     for the next page and the next visit. A choice re-sorts the rows in
     place and they rise into the new order one after another, the way the
     page's blocks arrive, inside the time a control gets; no row slides
     past another. The home page's stack places its own cards, so its deck
     fades in as one. Under reduced motion they simply re-sort. */
  const LENSES = {
    hiring: { order: ["system", "cross-sell", "verifications", "refi", "staking", "no-code"] },   // the page's own order, the default
    pm: { order: ["cross-sell", "refi", "verifications", "system", "staking", "no-code"] },
    eng: { order: ["staking", "system", "no-code", "verifications", "refi", "cross-sell"] },
  };
  const initLens = () => $$("[data-lens]").forEach((lens) => {
    const list = $(".cases, .stack-deck", lens.parentNode);   // the work index's list, or the home page's deck
    const tabs = $$(".lens-tab", lens);
    if (!list || !tabs.length) return;
    const slugOf = (row) => (Array.from(row.classList).find((c) => c.startsWith("case-") && c !== "case-row") || "").slice(5);
    const sort = (key) => {
      const order = LENSES[key].order;
      const rows = $$(".case-row, .stack-card", list).sort((a, b) => {
        const ia = order.indexOf(slugOf(a)), ib = order.indexOf(slugOf(b));
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      rows.forEach((r) => list.append(r));
      list.dispatchEvent(new CustomEvent("lens"));
    };
    // On a phone the tabs become one dropdown (a native <select> under a
    // face that shows the choice). Until the reader picks, the face cycles
    // through the roles, one a beat, so the options are seen before the
    // dropdown is opened; it stops for good at the first choice or focus,
    // pauses off screen, and under reduced motion stands on the current role.
    const names = tabs.map((t) => [t.dataset.lensKey, t.textContent.trim()]);
    const pick = document.createElement("div");
    pick.className = "lens-pick";
    pick.innerHTML = `<span class="lens-pick-face" aria-hidden="true"><span class="lens-pick-word"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9"/></svg></span><select class="lens-select" aria-label="Viewing as" autocomplete="off"></select>`;
    names.forEach(([k, n]) => { const o = document.createElement("option"); o.value = k; o.textContent = n; $("select", pick).append(o); });
    $(".seg", lens).after(pick);
    lens.classList.add("has-pick");
    const select = $("select", pick), word = $(".lens-pick-word", pick);
    const face = (key, roll) => {
      word.textContent = (names.find(([k]) => k === key) || names[0])[1];
      if (!roll) return;
      word.classList.remove("roll"); void word.offsetWidth; word.classList.add("roll");   // restart the rise
    };
    let current = "hiring", chosen = false, cycleAt = 0, timer = 0, dealt = [];
    const phone = window.matchMedia("(max-width: 640px)");
    const cycle = () => {
      clearInterval(timer);
      if (chosen || reduced || !phone.matches || !onScreen()) { face(current, false); return; }
      timer = setInterval(() => { cycleAt = (cycleAt + 1) % names.length; face(names[cycleAt][0], true); }, 1700);
    };
    const onScreen = whileOnScreen(pick, 0, () => cycle());
    const stop = () => { if (chosen) return; chosen = true; clearInterval(timer); face(current, false); };
    select.addEventListener("focus", stop);
    select.addEventListener("pointerdown", stop);
    select.addEventListener("change", () => { stop(); pick.classList.add("picked"); apply(select.value, true); });   // a real choice: the face goes from hint to value
    phone.addEventListener("change", cycle);
    const apply = (key, animate) => {
      if (key === "leader" || key === "recruiter") key = "hiring";   // older names: a saved Recruiter view folds into Design leader
      if (!LENSES[key]) key = "hiring";
      current = key;
      select.value = key;
      if (chosen || reduced) face(key, false);
      tabs.forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.lensKey === key)));
      try { localStorage.setItem("lens", key); } catch (e) { /* private mode */ }
      dealt.forEach((a) => a.cancel());
      dealt = [];
      sort(key);
      if (animate && !reduced) {
        const anim = document.documentElement.classList.contains("anim");
        const waiting = (el) => { const b = el.closest("[data-reveal]"); return anim && b && !b.classList.contains("in"); };   // a block still waiting for its reveal keeps waiting
        if (list.matches(".stack-deck")) {   // the stack places its own cards: the deck fades in as one, so no card shows through the one in front
          if (!waiting(list)) dealt = [list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE })];
        } else {
          dealt = $$(".case-row", list).filter((r) => !waiting(r)).map((r, i) => r.animate(
            [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
            { duration: 200, delay: i * 16, easing: EASE, fill: "backwards" }));   // the last row lands inside 300ms
        }
      }
    };
    tabs.forEach((t) => t.addEventListener("click", () => apply(t.dataset.lensKey, true)));
    let saved = "hiring";
    try { saved = localStorage.getItem("lens") || "hiring"; } catch (e) { /* private mode */ }
    face("hiring", false);
    if (saved !== "hiring" && !phone.matches) apply(saved, false);   // on a phone every visit starts on the hint; a choice holds for the page it was made on
    cycleAt = Math.max(0, names.findIndex(([k]) => k === current));
    select.value = current;   // the browser may restore an old choice into the select; the list is in this order
    window.addEventListener("pageshow", () => { select.value = current; });
    cycle();
  });

  /* ---- Steps ----
     After diabrowser.com. A decisions block marked data-steps, whose columns
     each end in a shot, becomes from 761px up a numbered list beside one
     panel that sticks and shows the step nearest the middle of the screen.
     The shots move into the panel and back again below 761px, so nothing
     is drawn twice. */
  const initSteps = () => $$("[data-steps]").forEach((block) => {
    const cols = $(".cols", block);
    const steps = cols ? $$(":scope > .col", cols).filter((c) => $(".shot", c)) : [];
    if (steps.length < 2) return;
    const wide = window.matchMedia("(min-width: 761px)");
    const stage = document.createElement("div");
    stage.className = "steps-stage";
    const shots = steps.map((c) => $(".shot", c));
    steps.forEach((c, i) => {
      const head = $(".col-head", c);
      if (!head || $(".step-no", head)) return;
      const n = document.createElement("span");
      n.className = "step-no fig-no";
      n.textContent = String(i + 1).padStart(2, "0");
      head.prepend(n);
    });
    let on = -1, mounted = false;
    const show = (i) => {
      if (i === on) return;
      steps.forEach((c, k) => { if (k === i) c.setAttribute("aria-current", "step"); else c.removeAttribute("aria-current"); });
      shots.forEach((s, k) => { s.classList.toggle("is-on", k === i); s.setAttribute("aria-hidden", String(k !== i)); });
      on = i;
    };
    const nearest = () => {
      const mid = window.innerHeight * 0.45;
      let best = 0, d = Infinity;
      steps.forEach((c, i) => { const b = c.getBoundingClientRect(); const gap = Math.abs((b.top + b.bottom) / 2 - mid); if (gap < d) { d = gap; best = i; } });
      return best;
    };
    const mount = () => {
      if (mounted) return;
      mounted = true;
      shots.forEach((s) => stage.append(s));
      stage.style.gridRow = `1 / span ${steps.length}`;
      cols.append(stage);
      block.classList.add("steps", "on");
      show(nearest());
    };
    const unmount = () => {
      if (!mounted) return;
      mounted = false;
      shots.forEach((s, i) => { steps[i].append(s); s.classList.remove("is-on"); s.removeAttribute("aria-hidden"); });
      stage.remove();
      block.classList.remove("on");
      steps.forEach((c) => c.removeAttribute("aria-current"));
      on = -1;
    };
    const sync = () => (wide.matches ? mount() : unmount());
    wide.addEventListener("change", sync);
    sync();
    let tick = false;
    window.addEventListener("scroll", () => {
      if (!mounted || tick) return;
      tick = true;
      requestAnimationFrame(() => { tick = false; show(nearest()); });
    }, { passive: true });
  });

  /* ---- The agent window ----
     After granola.ai and replicate.com. A figure marked data-demo carries
     its script as JSON (a script tag inside it) and a window with a status,
     a log and a figure; this plays the steps in order and loops, holding
     each for its hold_ms. A figure with a `to` counts from its value to it.
     It waits for its block to reveal, runs only on screen, stops behind its
     button, and under reduced motion shows the run's last step and nothing
     moves. */
  const initDemo = () => $$("[data-demo]").forEach((fig) => {
    const src = $("script[data-demo-script]", fig);
    const win = $(".agent-win", fig);
    if (!src || !win) return;
    let script;
    try { script = JSON.parse(src.textContent); } catch (e) { return; }
    const steps = script.steps || [];
    if (!steps.length) return;
    const status = $("[data-demo-status]", win), log = $("[data-demo-log]", win), figEl = $("[data-demo-fig]", win);
    const num = $("b", figEl), unit = $("span", figEl);
    let raf = 0;
    const count = (f, animate) => {
      const to = f.to == null ? f.value : f.to;
      cancelAnimationFrame(raf);
      if (!animate || f.to == null) { num.textContent = to; return; }
      const parse = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
      const a = parse(f.value), b = parse(to), dec = (String(to).split(".")[1] || "").replace(/\D/g, "").length;
      const suffix = String(to).replace(/[0-9.,]/g, "");
      const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
      const t0 = performance.now(), dur = 900;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        num.textContent = p < 1 ? fmt(a + (b - a) * e) : to;
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const render = (step, animate) => {
      status.textContent = step.label;
      win.classList.toggle("busy", animate && step.kind !== "result");
      log.replaceChildren(...(step.lines || []).map((t, i) => {
        const li = document.createElement("li");
        li.textContent = t;
        li.style.setProperty("--i", String(i));
        return li;
      }));
      if (step.figure) { figEl.hidden = false; unit.textContent = step.figure.unit || ""; count(step.figure, animate); }
      else figEl.hidden = true;
    };
    const last = steps.find((s) => s.id === (script.final_state || {}).step) || steps[steps.length - 1];
    if (reduced) { render(last, false); return; }
    const btn = $(".art-ctl", fig);
    let i = -1, timer = 0, playing = true, started = false;
    // The window keeps its tallest step's height at the current width, so the
    // page under it never moves as the steps change (on a phone they differ
    // by a third). Each step is drawn once, unseen, to measure it.
    const fit = () => {
      win.style.minHeight = "";
      const tallest = Math.max(...steps.map((st) => { render(st, false); return win.offsetHeight; }));
      win.style.minHeight = `${tallest}px`;
      render(i < 0 ? last : steps[i], false);
    };
    fit();
    if (document.fonts) document.fonts.ready.then(fit);
    let fitW = window.innerWidth;
    window.addEventListener("resize", debounce(() => { if (window.innerWidth !== fitW) { fitW = window.innerWidth; fit(); } }, 150));
    const visible = whileOnScreen(fig, 0.2, () => sync());
    const next = () => {
      i = (i + 1) % steps.length;
      render(steps[i], true);
      timer = setTimeout(next, steps[i].hold_ms || 1800);
    };
    const sync = () => {
      clearTimeout(timer);
      if (!started) return;
      if (playing && visible()) timer = setTimeout(next, i < 0 ? 0 : 500);
      else win.classList.remove("busy");
    };
    if (btn) {
      btn.hidden = false;
      setPaused(btn, playing, "the agent demo");
      btn.addEventListener("click", () => { playing = !playing; setPaused(btn, playing, "the agent demo"); sync(); });
    }
    render(last, false);   // still, until its block has arrived
    afterReveal(fig, () => { started = true; sync(); });
  });

  /* ---- The palette ----
     After the ⌘K menus on vercel.com and docs.stripe.com. ⌘K (Ctrl+K), or
     the bar's Search row (in each page's markup; a page without it gets one
     here), opens a dialog with one field: type,
     and the pages, sections, case studies and posts that match come up
     from /search-index.json (blog.py writes it); arrows move, Enter goes.
     The last row hands whatever was typed to the assistant, so a question
     the index cannot answer still gets one. The index loads once, on first
     open, so a reader who never presses the keys pays nothing. */
  const initPalette = () => {
    const nav = $(".nav-links ul");
    if (!nav) return;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    let li = $(".nav-search", nav);
    if (!li) {
      li = document.createElement("li");
      li.className = "nav-search";
      li.innerHTML = `<button class="nav-kbd" type="button"><span>Search</span><kbd aria-hidden="true"></kbd></button>`;   // the key cap's text comes from styles.css
      const blog = $$("li", nav).find((l) => /blog\.html$/.test($("a", l)?.getAttribute("href") || ""));
      if (blog) blog.after(li); else nav.append(li);
    }
    const trigger = $("button", li);
    trigger.setAttribute("aria-keyshortcuts", mac ? "Meta+K" : "Control+K");

    const dlg = document.createElement("dialog");
    dlg.className = "palette";
    dlg.setAttribute("aria-label", "Search the site");
    dlg.innerHTML = `
      <form class="palette-form" role="search">
        <svg class="palette-glass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17 17L21 21"/><path d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"/></svg>
        <input class="palette-input" id="palette-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search, or ask a question" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list">
        <button class="palette-close" type="button" aria-label="Close search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085"/></svg></button>
      </form>
      <ul class="palette-list" id="palette-list" role="listbox" aria-label="Results" tabindex="-1"></ul>
      <p class="palette-foot t-micro" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></p>`;
    document.body.append(dlg);
    const input = $("input", dlg), list = $(".palette-list", dlg);
    let index = null, loading = null, rows = [], cursor = 0, from = null;

    const load = () => loading || (loading = fetch("/search-index.json").then((r) => (r.ok ? r.json() : [])).then((d) => (index = d)).catch(() => (index = [])));
    const score = (e, words, q) => {
      const t = fold(e.t), d = fold(e.d || ""), k = fold(e.k || "");
      if (!q) return e.k === "Page" || e.k.startsWith("Case") ? 1 : 0;
      let s = 0;
      if (t.startsWith(q)) s += 4; else if (t.includes(q)) s += 3;
      words.forEach((w) => {
        if (w.length < 3) return;                                   // "in", "a": everywhere, so they say nothing
        const at = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);   // at the start of a word
        if (at.test(t)) s += 1.5; else if (at.test(d) || at.test(k)) s += 0.75;
      });
      return s;
    };
    const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const draw = () => {
      const q = fold(input.value.trim()), words = q.split(/\s+/).filter(Boolean);
      const hits = (index || []).map((e) => [score(e, words, q), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, e]) => e);
      rows = hits.map((e) => ({ kind: "go", url: e.u, html: `<span class="palette-title">${escapeHtml(e.t)}</span><span class="palette-kind">${escapeHtml(e.k)}</span>${e.d ? `<span class="palette-desc">${escapeHtml(e.d)}</span>` : ""}` }));
      if (q && $(".chat-launch")) {
        const row = { kind: "ask", q: input.value.trim(), html: `<span class="palette-title">Ask: “${escapeHtml(input.value.trim())}”</span><span class="palette-kind">Assistant</span><span class="palette-desc">Hand the question to the assistant, which answers from the site.</span>` };
        if (/\?$/.test(q) || words.length >= 4) rows.unshift(row); else rows.push(row);   // a question comes first; a word or two is a search
      }
      if (!rows.length) rows.push({ kind: "none", html: `<span class="palette-title">Nothing matches</span><span class="palette-desc">Try a page name, a company or a topic.</span>` });
      cursor = 0;
      list.innerHTML = rows.map((r, i) => `<li class="palette-row ${r.kind}" role="option" id="palette-opt-${i}" aria-selected="${i === 0}">${r.html}</li>`).join("");
      list.scrollTop = 0;   // the selected first row is in view after every keystroke
      input.setAttribute("aria-activedescendant", rows.length ? "palette-opt-0" : "");
    };
    const move = (d) => {
      if (!rows.length) return;
      cursor = (cursor + d + rows.length) % rows.length;
      $$(".palette-row", list).forEach((r, i) => r.setAttribute("aria-selected", String(i === cursor)));
      input.setAttribute("aria-activedescendant", `palette-opt-${cursor}`);
      $$(".palette-row", list)[cursor].scrollIntoView({ block: "nearest" });
    };
    const close = () => {
      if (!dlg.open) return;
      dlg.close();
      document.documentElement.classList.remove("palette-open");
      const back = from && from.closest(".nav-links") && sheetWide.matches ? $(".nav-toggle") : from;   // the sheet it came from is closed now
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
    const ask = (q) => document.dispatchEvent(new CustomEvent("chat:ask", { detail: q }));   // the chat opens and asks, or holds the question if it is busy
    const go = (i) => {
      const r = rows[i];
      if (!r || r.kind === "none") return;
      close();
      if (r.kind === "ask") { ask(r.q); return; }
      const here = location.pathname + location.hash;
      const [path, hash] = r.url.split("#");
      if (path === location.pathname && hash) {
        const el = document.getElementById(hash);
        if (el) { history.pushState(null, "", `#${hash}`); jumpTo(el); el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); el.tabIndex = -1; el.focus({ preventScroll: true }); return; }
      }
      if (r.url !== here) location.href = r.url;
    };
    const sheetWide = window.matchMedia("(max-width: 1023px)");
    const open = () => {
      if (dlg.open) return;
      from = document.activeElement;
      document.dispatchEvent(new CustomEvent("nav:close"));   // a result may scroll this page or open the chat, so the menu sheet goes first
      dlg.showModal();
      document.documentElement.classList.add("palette-open");
      input.value = "";
      load().then(draw);
      draw();
      input.focus();
    };
    trigger.addEventListener("click", open);
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.open ? close() : open(); }
    });
    $(".palette-form", dlg).addEventListener("submit", (e) => { e.preventDefault(); go(cursor); });
    $(".palette-close", dlg).addEventListener("click", close);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    });
    list.addEventListener("click", (e) => { const row = e.target.closest(".palette-row"); if (row) go($$(".palette-row", list).indexOf(row)); });
    list.addEventListener("pointermove", (e) => { const row = e.target.closest(".palette-row"); if (!row) return; const i = $$(".palette-row", list).indexOf(row); if (i !== cursor) { cursor = i; $$(".palette-row", list).forEach((r, k) => r.setAttribute("aria-selected", String(k === i))); } });
  };

  /* ---- Blog post list ----
     Search filters the cards by title and blurb, hiding a pillar group once
     nothing in it matches; the toggle switches every group between the card
     grid and the hairline list. Both are progressive: without JS the grid is
     already there and the controls simply do nothing. */
  const initPostList = () => {
    const head = $("#post-search");
    const groups = $$(".pillar-group");
    if (!head || !groups.length) return;
    const empty = $(".posts-empty");

    const filter = () => {
      const q = fold(head.value.trim());
      let shown = 0;
      groups.forEach((g) => {
        let n = 0;
        $$(".post-card", g).forEach((c) => {
          const hit = !q || fold(c.dataset.title).includes(q) || fold(c.dataset.desc).includes(q);
          c.hidden = !hit;
          if (hit) n++;
        });
        g.hidden = q ? n === 0 : false;
        shown += n;
      });
      if (empty) empty.hidden = shown > 0;
    };
    // A topic link whose group the search is hiding clears the search first,
    // so the jump lands on the group rather than on nothing.
    $$(".pillar-nav a").forEach((a) => a.addEventListener("click", () => { if (head.value) { head.value = ""; filter(); } }));

    const view = (name) => {
      $$(".pillar-group .cards").forEach((c) => (c.dataset.view = name));
      $$(".view-toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === name)));
      try { localStorage.setItem("blog-view", name); } catch { /* private window: the choice just doesn't persist */ }
    };

    head.addEventListener("input", debounce(filter, 120));
    $$(".view-toggle button").forEach((b) => b.addEventListener("click", () => view(b.dataset.view)));
    let saved = null;
    try { saved = localStorage.getItem("blog-view"); } catch { /* ignore */ }
    if (saved === "list") view("list");
  };

  /* ---- Chat ----
     The assistant (api/chat.js). A button in the bottom corner opens a panel
     that answers questions about the work from the site's own pages. Nothing
     shows until /api/chat says it is switched on, so a site without the key,
     or the static preview server, simply has no button. The answer streams in
     as one JSON event a line and is drawn as light Markdown: paragraphs, "- "
     lists, bold and links, every piece built as text, never parsed as HTML.
     The conversation lives in sessionStorage, so a link to a case study
     carries it over to the next page (and on a laptop the panel reopens
     there). On a phone the panel is a modal sheet over the whole screen, like
     the menu; elsewhere it sits in the corner and the page stays usable.
     Locked case studies: when a question needs one, the model asks for the
     password with a tool, the panel answers with a password field, and a
     right password unlocks the case studies site-wide and asks the question
     again. A password typed as a question does the same, and the bubble that
     carried it is masked.
     Under an answer: the pages it drew on as source cards ({t: 'source'},
     from the model's citations), and the cards its tools ask for
     ({t: 'card'}: a case study, or John's contact buttons), every one
     cloned from a <template> in the panel and filled as text, never built
     from the model's words as HTML. A source card for the page you are on
     scrolls to the section and rings it. On the empty panel a second row of
     suggestions asks who you are, and sends a longer question than its label. */
  const initChat = () => {
    if (!window.ReadableStream || !window.TextDecoder || !window.HTMLDialogElement) return;
    fetch("/api/chat", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((state) => { if (state && state.ready) buildChat(state); })
      .catch(() => {});
  };

  const buildChat = (state) => {
    const KEY = "chat.v1";
    const INTRO = "I’m an AI assistant. I answer from the pages on this site, so ask about John’s projects, how he leads or what he’s looking for next.";
    const UNLOCKED = "Unlocked. The case studies are open now, so ask me about the results, the numbers or how the work was done.";
    const phone = window.matchMedia("(max-width: 640px)");
    const fine = window.matchMedia("(pointer: fine)");
    const root = document.documentElement;
    const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
    const ICON = {
      spark: icon('<path d="M15 2L15.5387 4.39157C15.9957 6.42015 17.5798 8.00431 19.6084 8.46127L22 9L19.6084 9.53873C17.5798 9.99569 15.9957 11.5798 15.5387 13.6084L15 16L14.4613 13.6084C14.0043 11.5798 12.4202 9.99569 10.3916 9.53873L8 9L10.3916 8.46127C12.4201 8.00431 14.0043 6.42015 14.4613 4.39158L15 2Z"/><path d="M7 12L7.38481 13.7083C7.71121 15.1572 8.84275 16.2888 10.2917 16.6152L12 17L10.2917 17.3848C8.84275 17.7112 7.71121 18.8427 7.38481 20.2917L7 22L6.61519 20.2917C6.28879 18.8427 5.15725 17.7112 3.70827 17.3848L2 17L3.70827 16.6152C5.15725 16.2888 6.28879 15.1573 6.61519 13.7083L7 12Z"/>'),
      close: icon('<path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085"/>'),
      send: icon('<path d="M12 5.5V19"/><path d="M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11"/>'),
      stop: icon('<path d="M4 12C4 8.72077 4 7.08116 4.81382 5.91891C5.1149 5.48891 5.48891 5.1149 5.91891 4.81382C7.08116 4 8.72077 4 12 4C15.2792 4 16.9188 4 18.0811 4.81382C18.5111 5.1149 18.8851 5.48891 19.1862 5.91891C20 7.08116 20 8.72077 20 12C20 15.2792 20 16.9188 19.1862 18.0811C18.8851 18.5111 18.5111 18.8851 18.0811 19.1862C16.9188 20 15.2792 20 12 20C8.72077 20 7.08116 20 5.91891 19.1862C5.48891 18.8851 5.1149 18.5111 4.81382 18.0811C4 16.9188 4 15.2792 4 12Z"/>'),
    };
    const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    // What this tab has said so far, and whether the panel was open.
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (_) { /* private mode: a fresh start */ }
    let msgs = (Array.isArray(saved.msgs) ? saved.msgs : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40);
    let unlocked = !!state.unlocked;
    let busy = null;                                   // the AbortController of the answer being read
    let offered = !!saved.offered;                     // the walkthrough offer, made once a tab
    const save = (open, cite) => { try { sessionStorage.setItem(KEY, JSON.stringify({ open, msgs, offered, cite })); } catch (_) { /* nothing to keep it in */ } };   // cite: a source card's link, to ring its section on the next page

    /* Who is asking: each chip sends a fuller question than its label. */
    const AUDIENCE = [
      ["Recruiter", "I’m a recruiter. What has John shipped, with the outcomes, and what size of team has he led?"],
      ["Design leader", "I’m a design leader. How does John run a design team, and what does he hold the bar on?"],
      ["Engineer", "I’m an engineer. How does John work with engineering, and what has he built with AI agents?"],
    ];

    /* The button and the panel */
    /* What the button offers follows the page: a case study names its
       project and asks about it, a post asks about the post, the work index
       about the work. Everywhere else it is the dashboard's own questions. */
    const topic = (() => {
      const path = location.pathname;
      const h1 = ($(".cs-hero h1, main h1") || {}).textContent || "";
      const name = h1.split(":")[0].trim();
      const list = (a) => (Array.isArray(a) ? a : []);       // each kind's questions come from Chat settings
      if (/^\/work\/[\w-]+\.html$/.test(path) && name) {
        const short = name.length <= 26 ? name : "this project";
        return { label: `Ask about ${short}`, starters: list(state.caseStarters).map((q) => q.replace(/\{project\}/g, short)) };
      }
      if (/^\/blog\/[\w-]+\.html$/.test(path)) return { label: "Ask about this post", starters: list(state.postStarters) };
      if (/^\/work(\.html)?$/.test(path)) return { label: "Ask about the work", starters: list(state.workStarters) };
      return { label: "Ask about my work", starters: state.starters };
    })();

    const launch = make("button", "btn btn-primary chat-launch");
    launch.type = "button";
    launch.setAttribute("aria-haspopup", "dialog");
    launch.setAttribute("aria-controls", "chat");
    launch.setAttribute("aria-expanded", "false");
    launch.innerHTML = `<span class="chat-launch-sweep" aria-hidden="true"></span>${ICON.spark}<span class="chat-launch-label"></span>`;
    $(".chat-launch-label", launch).textContent = topic.label;

    const dlg = make("dialog", "chat");
    dlg.id = "chat";
    dlg.setAttribute("aria-labelledby", "chat-title");
    dlg.innerHTML = `
      <div class="chat-head">
        <div>
          <p class="eyebrow">AI assistant</p>
          <h2 class="t-subhead" id="chat-title" tabindex="-1"></h2>
        </div>
        <button class="icon-btn chat-close" type="button" aria-label="Close the chat">${ICON.close}</button>
      </div>
      <div class="chat-log" role="region" aria-label="Conversation" tabindex="0"></div>
      <form class="chat-form">
        <label class="sr-only" for="chat-input">Ask a question</label>
        <textarea id="chat-input" rows="1" maxlength="600" placeholder="Ask a question" enterkeyhint="send" autocomplete="off"></textarea>
        <button class="chat-send" type="submit" aria-label="Send">${ICON.send}</button>
      </form>
      <p class="t-small chat-foot">The assistant answers from this site and can get things wrong. I read the questions people ask.</p>
      <p class="sr-only" role="status" id="chat-status"></p>
      <template class="chat-tpl-source"><li><a class="chat-source"><img class="chat-source-thumb" alt="" decoding="async" hidden><span class="chat-source-title"></span><span class="chat-source-label"></span></a></li></template>
      <template class="chat-tpl-case"><div class="chat-card chat-card-case"><img class="case-logo" alt="" decoding="async"><div class="chat-card-title"></div><div class="t-small chat-card-summary"></div><div class="chat-card-stat"></div><div class="t-small chat-card-note"></div><div class="chips"></div><div class="chat-card-row"><a class="btn btn-primary btn-sm chat-card-link">Read the case study</a><span class="t-small chat-card-lock">Password protected</span></div></div></template>
      <template class="chat-tpl-contact"><div class="chat-card chat-card-contact"><div class="t-small chat-card-summary">Email is the quickest way to reach me. LinkedIn works too.</div><div class="chat-card-row"><a class="btn btn-primary btn-sm" data-to="email">Email John</a><a class="btn btn-ghost btn-sm" data-to="linkedin" target="_blank" rel="noopener">Message on LinkedIn</a><a class="btn btn-ghost btn-sm" data-to="resume">Download resume</a></div></div></template>`;
    $("#chat-title", dlg).textContent = topic.label;
    document.body.append(launch, dlg);
    launch.inert = document.documentElement.classList.contains("nav-locked");   // built after the fetch: if the phone menu is already open, it joins the page held behind it
    const log = $(".chat-log", dlg), form = $(".chat-form", dlg), input = $("#chat-input", dlg);
    const send = $(".chat-send", dlg), title = $("#chat-title", dlg), status = $("#chat-status", dlg);
    const tpl = (cls) => $(`template.${cls}`, dlg).content.firstElementChild.cloneNode(true);
    // A link an answer or a card may carry: a path on this site, https, or
    // mail. Parsed rather than pattern-matched, since the URL parser drops
    // tabs and newlines ("/\t/host" would pass a pattern and leave the site),
    // and a link the parser refuses comes back empty instead of throwing.
    const safeHref = (u) => {
      if (typeof u !== "string") return "";
      let url;
      try { url = new URL(u, location.href); } catch (_) { return ""; }
      if (/^\//.test(u)) return url.origin === location.origin ? url.pathname + url.search + url.hash : "";
      if (url.protocol === "https:" && /^https:\/\//i.test(u)) return url.href;
      if (url.protocol === "mailto:" && /^mailto:/i.test(u)) return url.href;
      return "";
    };
    const sitePath = (u) => { const h = safeHref(u); return h.startsWith("/") ? h : ""; };   // a path on this site, never another host

    /* The cards under an answer, from the templates above. Every value the
       server sends lands as text or as a checked path. */
    const sourceItem = (v) => {
      const li = tpl("chat-tpl-source"), a = $(".chat-source", li), img = $(".chat-source-thumb", li);
      a.href = sitePath(v.url) || "/";
      const thumb = sitePath(v.thumb);
      if (thumb) { img.src = thumb; img.hidden = false; }
      else { const slot = document.createElement("span"); slot.className = "chat-source-thumb"; img.replaceWith(slot); }   // the empty slot keeps a row of cards level
      $(".chat-source-title", li).textContent = String(v.title || "");
      $(".chat-source-label", li).textContent = String(v.label || "");
      return li;
    };
    const card = (v) => {
      if (!v || typeof v !== "object") return null;
      if (v.kind === "contact") {
        const c = tpl("chat-tpl-contact");
        const to = { email: CONFIG.email ? `mailto:${CONFIG.email}?subject=${encodeURIComponent("Following up on your work")}` : "", linkedin: CONFIG.linkedin, resume: CONFIG.resume };
        $$("[data-to]", c).forEach((a) => { if (to[a.dataset.to]) a.href = to[a.dataset.to]; else a.remove(); });
        return c;
      }
      if (v.kind !== "case") return null;
      const c = tpl("chat-tpl-case"), logo = $(".case-logo", c), url = sitePath(v.url);
      if (sitePath(v.logo)) { logo.src = v.logo; logo.alt = String(v.company || ""); } else logo.remove();
      $(".chat-card-title", c).textContent = String(v.title || "");
      $(".chat-card-summary", c).textContent = String(v.summary || "");
      const stat = $(".chat-card-stat", c), note = $(".chat-card-note", c), chips = $(".chips", c), link = $(".chat-card-link", c), lock = $(".chat-card-lock", c);
      if (v.stat) stat.textContent = String(v.stat); else stat.remove();
      if (v.stat && v.statNote) note.textContent = String(v.statNote); else note.remove();
      if (Array.isArray(v.chips) && v.chips.length) v.chips.slice(0, 4).forEach((t) => chips.append(make("span", "chip", String(t)))); else chips.remove();
      if (url) link.href = url; else link.remove();
      if (!v.locked) lock.remove();
      return c;
    };
    const attach = (m, extras) => {
      if (!extras) return;
      const sources = (Array.isArray(extras.sources) ? extras.sources : []).filter((v) => v && typeof v === "object").slice(0, 3);
      if (sources.length) {
        const ul = make("ul", "chat-sources");
        ul.setAttribute("aria-label", "Sources");
        sources.forEach((v) => ul.append(sourceItem(v)));
        m.append(ul);
      }
      (Array.isArray(extras.cards) ? extras.cards : []).slice(0, 4).forEach((v) => { const c = card(v); if (c) m.append(c); });
    };

    /* A source card for the page you are on: scroll to its section and ring
       it for a moment, rather than reload. The ring goes on the section's
       column (.wrap), so it hugs the text and not the full-bleed ground. */
    const here = (href) => { try { const u = new URL(href, location.href); return { same: u.pathname === location.pathname, hash: u.hash }; } catch (_) { return { same: false, hash: "" }; } };
    let ringing = 0;
    const ring = (hash) => {
      const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return false;
      const box = target.querySelector(":scope > .wrap") || target;
      clearTimeout(ringing);
      $$(".chat-cited").forEach((el) => el.classList.remove("chat-cited"));
      box.classList.add("chat-cited");
      jumpTo(box);
      box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      ringing = setTimeout(() => box.classList.remove("chat-cited"), 1700);
      return true;
    };

    /* Light Markdown, built as nodes. Links go to the site's own pages, to
       https or to mail; anything else stays text. */
    const inline = (text, into) => {
      const re = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*/g;
      let at = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > at) into.append(text.slice(at, m.index));
        if (m[3]) into.append(make("strong", "", m[3]));
        else if (safeHref(m[2])) {   // a site path, https or mail; anything else stays text
          const href = safeHref(m[2]), a = make("a", "", m[1]);
          a.href = href;
          if (/^https:/.test(href) && new URL(href).host !== location.host) { a.target = "_blank"; a.rel = "noopener"; }
          into.append(a);
        } else into.append(m[1]);
        at = re.lastIndex;
      }
      if (at < text.length) into.append(text.slice(at));
      return into;
    };
    const render = (text, into) => {
      const who = make("span", "sr-only", "Assistant: ");
      into.replaceChildren(who);
      let para = [], list = null;
      const flush = () => { if (para.length) into.append(inline(para.join(" "), make("p"))); para = []; };
      for (const line of text.split("\n")) {
        const item = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
        if (item) { flush(); if (!list) { list = make("ul"); into.append(list); } list.append(inline(item[1], make("li"))); }
        else if (!line.trim()) { flush(); list = null; }
        else { list = null; para.push(line.trim()); }
      }
      flush();
    };
    const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "");

    /* The log: the greeting, the suggested questions until the first one is
       asked, then the turns. It follows the answer down as it streams unless
       the reader has scrolled up to read something. */
    let pinned = true;
    log.addEventListener("scroll", () => { pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48; }, { passive: true });
    const stick = (force) => { if (!msgs.length) return; if (force || pinned) log.scrollTop = log.scrollHeight; };   // the empty panel stays at the top: the greeting, then the suggestions
    const bubble = (role, content, extras) => {
      const m = make("div", `chat-msg is-${role}`);
      if (role === "user") m.append(make("span", "sr-only", "You: "), content);
      else {
        const box = make("div", "chat-answer");
        render(content, box);
        m.append(box);
        attach(m, extras);
      }
      log.append(m);
      return m;
    };
    let starters = null, audience = null;
    const chipRow = (list, label, onPick) => {
      const ul = make("ul", "chat-starters");
      ul.setAttribute("aria-label", label);
      list.forEach(([text, q]) => {
        const b = make("button", "btn btn-ghost btn-sm", text);
        b.type = "button";
        b.addEventListener("click", () => onPick(q));
        const li = make("li");
        li.append(b);
        ul.append(li);
      });
      return ul;
    };
    const drawLog = () => {
      log.replaceChildren();
      bubble("assistant", INTRO);
      if (!msgs.length) {
        if (Array.isArray(topic.starters) && topic.starters.length) {
          starters = chipRow(topic.starters.map((q) => [q, q]), "Suggested questions", ask);
          log.append(starters);
        }
        audience = make("div", "chat-audience");
        audience.append(make("span", "t-small chat-audience-label", "I’m a"), chipRow(AUDIENCE, "Ask as", ask));
        log.append(audience);
      }
      msgs.forEach((m) => bubble(m.role, m.content, m));
      if (questions() >= LIMIT) endConversation(false);
      stick(true);
    };

    /* Asking. The reply is read line by line off the stream and drawn once a
       frame; the send button becomes Stop while it arrives. */
    const setBusy = (on) => {
      send.innerHTML = on ? ICON.stop : ICON.send;
      send.setAttribute("aria-label", on ? "Stop the answer" : "Send");
      log.setAttribute("aria-busy", String(on));
      sync();
    };
    const sync = () => { send.disabled = !busy && !input.value.trim(); };

    const LIMIT = Number(state.limit) || 8;            // questions a conversation may ask (Chat settings); api/chat.js holds the same line
    const questions = () => msgs.filter((m) => m.role === "user").length;
    const ask = (question) => {
      if (busy || questions() >= LIMIT) return;
      const q = (question ?? input.value).trim();
      if (!q) return;
      const held = [starters, audience].some((row) => row && row.contains(document.activeElement));
      if (starters) { starters.remove(); starters = null; }
      if (audience) { audience.remove(); audience = null; }
      if (held) (fine.matches ? input : title).focus({ preventScroll: true });   // the chip that had focus is gone
      input.value = "";
      msgs.push({ role: "user", content: q });
      const mine = bubble("user", q);
      save(true);
      answer(mine);
    };

    const answer = async (mine) => {
      const reply = make("div", "chat-msg is-assistant is-waiting");
      const dots = make("span", "chat-wait");
      dots.setAttribute("aria-hidden", "true");
      dots.append(make("i"), make("i"), make("i"));
      reply.append(dots);
      log.append(reply);
      stick(true);
      status.textContent = "Answering…";
      busy = new AbortController();
      setBusy(true);
      let text = "", asked = false, opened = false, failed = "", frame = 0;
      const sources = [], cards = [];                  // the pages it cites and the cards it asks for, drawn once the words are in
      const box = make("div", "chat-answer");
      const paint = () => { frame = 0; reply.classList.remove("is-waiting"); if (!box.isConnected) reply.replaceChildren(box); render(text, box); stick(); };
      try {
        const res = await fetch("/api/chat", {
          method: "POST", credentials: "same-origin", signal: busy.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs.slice(-16), page: location.pathname }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "The assistant couldn't answer just now. Try again in a moment.");
        }
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            let ev;
            try { ev = JSON.parse(line); } catch (_) { continue; }
            if (ev.t === "text") { text += ev.v; if (!frame) frame = requestAnimationFrame(paint); }
            else if (ev.t === "source") { if (sources.length < 3 && ev.v && typeof ev.v === "object") sources.push(ev.v); }
            else if (ev.t === "card") { if (cards.length < 4 && ev.v && typeof ev.v === "object") cards.push(ev.v); }
            else if (ev.t === "password") asked = true;
            else if (ev.t === "unlocked") opened = true;
            else if (ev.t === "error") failed = ev.v;
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") failed = err.message || "The assistant couldn't be reached. Try again in a moment.";
      }
      cancelAnimationFrame(frame);
      busy = null;
      setBusy(false);

      if (opened) {                                    // the question was the password
        msgs.pop();
        if (mine) mine.replaceChildren(make("span", "sr-only", "You entered the password: "), "••••••••");
        reply.remove();
        unlocked = true;
        const waiting = $$(".chat-unlock", log);
        if (waiting.length) {                          // it answered the field's request: the same as unlocking there
          waiting.forEach((c) => c.remove());
          const done = make("p", "chat-unlocked", "Case studies unlocked");
          done.setAttribute("role", "status");
          log.append(done);
          if (msgs.length && msgs[msgs.length - 1].role === "assistant") answer(null);   // the question that needed it, answered in full
        } else {
          msgs.push({ role: "assistant", content: UNLOCKED });
          bubble("assistant", UNLOCKED);
          status.textContent = UNLOCKED;
        }
      } else {
        const drew = !!text || cards.length > 0;
        if (drew) {                                    // the words, then the sources and cards under them
          reply.classList.remove("is-waiting");
          if (!box.isConnected) reply.replaceChildren(box);
          render(text, box);
          attach(reply, { sources, cards });
          msgs.push({ role: "assistant", content: text, sources, cards });
        }
        if (failed) {
          if (!drew) reply.replaceChildren();
          reply.classList.remove("is-waiting");
          reply.append(make("p", "chat-error", failed));
        }
        if (!drew && !failed) reply.remove();          // stopped before a word arrived
        status.textContent = failed || (text ? `Assistant: ${plain(text)}${sources.length ? ` Sources: ${sources.map((v) => String(v.title).replace(/[.!?…]+$/, "")).join(", ")}.` : ""}` : "");
        if (asked && !unlocked) passwordCard();
        else if (text && questions() >= LIMIT) endConversation(true);
        else if (text && !offered && questions() >= 3) offerWalkthrough();
      }
      save(dlg.open);
      stick();
    };

    /* After the third answer, once: an offer from John himself to walk them
       through the work, with the two ways to reach him. */
    /* The hard stop: after the eighth question the composer goes, and the
       conversation ends on the two ways to reach John. */
    const endConversation = (announce) => {
      form.hidden = true;
      if ($(".chat-end", log)) return;
      const card = make("div", "chat-offer chat-end");
      card.append(make("p", "chat-offer-text", "That's the limit for one chat. For anything more, I'd rather answer you myself."));
      const row = make("div", "chat-offer-row");
      const mail = make("a", "btn btn-primary btn-sm", "Email John");
      mail.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent("Following up on your work")}`;
      const li = make("a", "btn btn-ghost btn-sm", "Message on LinkedIn");
      li.href = CONFIG.linkedin; li.target = "_blank"; li.rel = "noopener";
      row.append(mail, li);
      card.append(row);
      log.append(card);
      if (announce) status.textContent = `${status.textContent} That's the limit for one chat.`;
      stick();
    };

    const offerWalkthrough = () => {
      offered = true;
      const card = make("div", "chat-offer");
      card.append(make("p", "chat-offer-text", "Want the full story? I’m happy to walk you through any of this work myself."));
      const row = make("div", "chat-offer-row");
      const mail = make("a", "btn btn-primary btn-sm", "Email John");
      mail.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent("Walkthrough of your work")}`;
      const li = make("a", "btn btn-ghost btn-sm", "Message on LinkedIn");
      li.href = CONFIG.linkedin; li.target = "_blank"; li.rel = "noopener";
      row.append(mail, li);
      card.append(row);
      log.append(card);
      stick();
    };

    /* The password field the model asks for. A right password unlocks the
       case studies (the cookie the gate sets) and asks the last question again. */
    let cards = 0;
    const passwordCard = () => {
      const id = `chat-pw-${++cards}`;
      const card = make("form", "chat-unlock");
      card.noValidate = true;
      card.innerHTML = `
        <label for="${id}">Case-study password</label>
        <div class="chat-unlock-row">
          <input id="${id}" type="password" autocomplete="current-password" required aria-describedby="${id}-note">
          <button class="btn btn-primary btn-sm" type="submit">Unlock</button>
        </div>
        <p class="t-small chat-error" id="${id}-error" role="alert" hidden></p>
        <p class="t-small" id="${id}-note">Don't have it? <a href="${CONFIG.linkedin}" target="_blank" rel="noopener">Message John on LinkedIn</a> and he'll send it.</p>`;
      log.append(card);
      stick(true);
      const field = $("input", card), err = $(".chat-error", card), btn = $("button", card);
      field.focus({ preventScroll: true });
      card.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!field.value.trim()) { field.focus(); return; }
        btn.disabled = true;
        let body = {};
        try {
          const res = await fetch("/api/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: field.value }) });
          body = await res.json().catch(() => ({}));
        } catch (_) { body = { error: "The assistant couldn't be reached. Try again in a moment." }; }
        btn.disabled = false;
        if (!body.unlocked) {
          err.textContent = body.error || "That password didn't match.";
          err.hidden = false;
          if (card === log.lastElementChild) stick(true);   // the line under the field, in view
          field.setAttribute("aria-invalid", "true");
          field.setAttribute("aria-describedby", `${id}-error ${id}-note`);
          field.select();
          return;
        }
        unlocked = true;
        const done = make("p", "chat-unlocked", "Case studies unlocked");
        done.setAttribute("role", "status");
        card.replaceWith(done);
        $$(".chat-unlock", log).forEach((c) => c.remove());   // any earlier field is moot now
        input.focus({ preventScroll: true });
        if (msgs.length && msgs[msgs.length - 1].role === "assistant") answer(null);   // the question that needed it, answered in full
      });
    };

    /* Opening and closing. On a phone the panel is modal and the page behind
       holds still; elsewhere the page stays in reach. Focus goes to the box
       where a keyboard is at hand, to the title on a touch screen (so the
       keyboard doesn't cover the suggestions), and back to the button after. */
    const vv = window.visualViewport;
    const fit = () => {                                // the sheet follows the visible area as a phone keyboard opens and closes
      if (!dlg.open || !phone.matches || !vv) return;
      dlg.style.height = `${vv.height}px`;
      dlg.style.top = `${vv.offsetTop}px`;
    };
    if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
    let closing = 0;
    const open = (focus, quiet) => {
      clearTimeout(closing);
      if (!dlg.open) {
        if (phone.matches) { dlg.showModal(); root.classList.add("chat-locked"); fit(); }
        else if (quiet) dlg.setAttribute("open", "");   // restored on a new page: show() would move focus into it, ahead of the skip link
        else dlg.show();
      }
      requestAnimationFrame(() => dlg.classList.add("is-open"));
      launch.setAttribute("aria-expanded", "true");
      save(true);
      stick(true);
      if (focus) (fine.matches ? input : title).focus({ preventScroll: true });
    };
    const close = () => {
      if (!dlg.open) return;
      dlg.classList.remove("is-open");
      launch.setAttribute("aria-expanded", "false");
      root.classList.remove("chat-locked");
      save(false);
      launch.focus({ preventScroll: true });
      clearTimeout(closing);
      closing = setTimeout(() => { dlg.close(); dlg.style.height = dlg.style.top = ""; }, reduced ? 0 : 200);
    };
    launch.addEventListener("click", () => open(true));
    document.addEventListener("chat:ask", (e) => {   // the palette's Ask row: open and ask, or hold the question if an answer is still coming
      const q = String(e.detail || "").trim();
      if (!q) return;
      if (!dlg.open) open(false);
      if (busy || questions() >= LIMIT || !form.isConnected || form.hidden) { input.value = q; sync(); input.focus({ preventScroll: true }); return; }
      ask(q);
    });
    $(".chat-close", dlg).addEventListener("click", close);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });   // Escape on the modal sheet
    dlg.addEventListener("keydown", (e) => { if (e.key === "Escape" && !phone.matches) { e.preventDefault(); close(); } });
    phone.addEventListener("change", () => { if (!dlg.open) return; dlg.close(); dlg.style.height = dlg.style.top = ""; root.classList.remove("chat-locked"); open(false); });   // the sheet's fitted height and top belong to the phone
    log.addEventListener("click", (e) => {
      const a = e.target.closest("a[href^='/']");
      if (!a) return;
      const src = a.classList.contains("chat-source") ? a.getAttribute("href") : "";
      const at = src ? here(src) : null;
      if (at && at.same) {                             // a source on this page: go to its section, no reload
        e.preventDefault();
        if (phone.matches) close();
        if (at.hash) { if (ring(at.hash)) history.replaceState(null, "", at.hash); else location.hash = at.hash; }
        else { jumpTo(null); window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); }
        return;
      }
      save(!phone.matches, src || undefined);        // on to another page: reopen there, except on a phone; a source rings its section on arrival
    });

    /* The composer: Enter sends, Shift+Enter breaks the line. */
    form.addEventListener("submit", (e) => { e.preventDefault(); if (busy) busy.abort(); else ask(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) ask(); }
    });
    input.addEventListener("input", sync);
    sync();

    drawLog();
    requestAnimationFrame(() => launch.classList.add("is-in"));
    if (saved.open && !phone.matches) open(false, true);
    if (saved.cite) {                                  // a source card brought them here: ring its section, once
      const at = here(saved.cite);
      if (at.same && at.hash) requestAnimationFrame(() => ring(at.hash));
      save(dlg.open);
    }
  };

  /* ---- Before and after ----
     No-code tools' two lanes (data-flow-ba). Staged the moment the script runs,
     played once when the figure reveals: the before lane walks its steps and
     stalls at the queue, then rises as the after lane runs straight through.
     Reduced motion, or a figure that settles without animating, shows both
     lanes finished. The dot is placed from the steps' own boxes, so it follows
     whichever layout the width gives (a row, or a column on a phone). It runs
     under the boxes, so only the gap between two steps shows it: a hop first
     slips it, unseen, to the far edge of the box it is in, and spends the whole
     hop crossing the gap, where it can be watched. */
  const initBeforeAfter = () => $$("[data-flow-ba]").forEach((fig) => {
    const [before, after] = $$(".ba-lane", fig);
    if (!before || !after) return;
    const steps = (lane) => $$(".ba-steps li", lane);
    const finish = () => {
      fig.classList.remove("is-staged");
      fig.classList.add("is-two");
      [before, after].forEach((lane) => {
        const s = steps(lane);
        s.forEach((li) => { li.classList.remove("is-waiting"); li.classList.add("is-reached"); });
        s[s.length - 1].classList.add("is-done");
      });
    };
    if (reduced) { finish(); return; }
    fig.classList.add("is-staged");

    const HOP = 900;   // one hop across a gap: the dot's transition in styles.css
    const HIDE = 16;   // how far inside a box the dot is out of sight: its radius and glow
    let last = null;   // where each dot was last sent, to put it back after a resize
    // Where on the rail the dot goes for step i: "mid", the middle of its box; "in"
    // and "out", just inside the edges it comes in and leaves by; "short", the
    // middle of the gap before the box, where it waits in sight. Only the distance
    // along the rail: across it, styles.css holds the dot on the lane's middle line.
    const spot = (lane, i, at) => {
      const s = steps(lane), L = lane.getBoundingClientRect(), r = s[i].getBoundingClientRect();
      const p = s[0].getBoundingClientRect(), q = s[1].getBoundingClientRect();
      const row = Math.abs(q.left - p.left) > Math.abs(q.top - p.top);   // a row, or a column on a phone
      const half = (row ? r.width : r.height) / 2, gap = row ? q.left - p.right : q.top - p.bottom;
      const d = { mid: 0, in: HIDE - half, out: half - HIDE, short: -half - gap / 2 }[at];
      return row ? ["--x", r.left - L.left - lane.clientLeft + half + d] : ["--y", r.top - L.top - lane.clientTop + half + d];
    };
    const place = (lane, i, at = "mid", glide = true) => {
      const dot = $(".ba-dot", lane), [axis, v] = spot(lane, i, at);
      if (!glide) { dot.style.transition = "none"; }
      dot.style.setProperty(axis, `${v}px`);
      if (!glide) { void dot.offsetWidth; dot.style.transition = ""; }
      dot.classList.add("is-on");
      last = [lane, i, at];
    };
    // A hop to step i. From inside a box the dot slips to its far edge first, so
    // the hop is all gap; the step lights as the dot goes half under it.
    const hop = (lane, i, at = "in") => {
      if (last[2] !== "short") place(lane, i - 1, "out", false);
      place(lane, i, at);
      if (at === "in") setTimeout(() => steps(lane)[i].classList.add("is-reached"), HOP * .7);
    };
    window.addEventListener("resize", debounce(() => {   // move the dot, but never bring back one that has gone out
      if (last && $(".ba-dot", last[0]).classList.contains("is-on")) place(last[0], last[1], last[2], false);
    }, 120));

    onceInView(fig, 0.35, (animate) => {
      if (!animate) { finish(); return; }
      // Each lane walks its steps, a beat on each; a step holding a .ba-wait note is
      // where it stalls: the dot waits in sight before it, the step goes amber for
      // 2.5s, then the dot goes through. Before ends and its dot goes out; the lanes
      // trade places; after runs to its last step. No-code tools stalls at the
      // engineering queue, Cross-Sell at the decline.
      let t = 0;
      const then = (ms, fn) => setTimeout(fn, (t += ms));   // ms after the beat before it
      const reach = (li) => li.classList.add("is-reached");
      const walk = (lane, lead, first, end) => {
        const s = steps(lane);
        then(lead, () => { place(lane, 0, "mid", false); reach(s[0]); });
        let beat = first;
        for (let i = 1; i < s.length; i++) {
          if ($(".ba-wait", s[i])) {
            then(beat, () => hop(lane, i, "short"));
            then(HOP,  () => { reach(s[i]); s[i].classList.add("is-waiting"); });
            then(2500, () => { s[i].classList.remove("is-waiting"); hop(lane, i); });
            beat = HOP + 200;
          } else {
            then(beat, () => hop(lane, i));
            beat = HOP + 500;
          }
        }
        then(HOP + 300, () => { s[s.length - 1].classList.add("is-done"); end(); });
      };
      walk(before, 600, 800, () => $(".ba-dot", before).classList.remove("is-on"));
      then(1000, () => fig.classList.add("is-two"));
      walk(after, 900, 700, () => fig.classList.remove("is-staged"));
    });
  });

  /* ---- Coaching cards ----
     Each clay model leans away from the pointer, up to 12px across and 9px
     down, a parallax that gives the render its depth. The lean waits for the
     model to land (the entrance in styles.css), then marks the card settled
     so the lean answers at once. Touch and reduced motion keep the still. */
  const initCoach = () => $$("[data-coach] .coach-card").forEach((card) => {
    const img = $(".coach-art img", card);
    if (!img) return;
    img.addEventListener("transitionend", (e) => { if (e.propertyName === "transform") card.classList.add("settled"); });
    const art = img.parentElement;
    let clip = null;
    // Each card enters on its own, once its well is on screen, so the build is
    // always seen: the card rises, then its build clip plays in the well at
    // 1.25x (a 4-5s render lands in 3-4s) and holds its last frame, the still.
    // The well stays empty until then; the still never shows first. The clip
    // is fetched a screen ahead; one still loading when the card arrives is
    // waited for, up to 4s, and the still drops in instead only if it fails.
    // Cards in one row go left to right. Reduced motion shows the stills.
    if (!reduced && document.documentElement.classList.contains("anim")) {
      card.classList.add("waits");
      let ready = false, go = false, started = false, gaveUp = false;
      const still = () => { if (started) return; gaveUp = true; art.classList.remove("has-build"); art.classList.add("show-still"); if (clip) clip.remove(); };
      const start = () => {
        if (!ready || !go || started || gaveUp) return;
        started = true;
        art.classList.add("has-build");
        clip.playbackRate = 1.25;
        clip.play().catch(() => { started = false; still(); });
      };
      if (art.dataset.build) {
        const near = new IntersectionObserver((es) => {
          if (!es[0].isIntersecting) return;
          near.disconnect();
          clip = document.createElement("video");
          Object.assign(clip, { muted: true, playsInline: true, preload: "auto", defaultPlaybackRate: 1.25, src: art.dataset.build });
          clip.setAttribute("aria-hidden", "true");
          clip.addEventListener("loadeddata", () => { ready = true; start(); }, { once: true });
          clip.addEventListener("error", still);
          art.append(clip);
        }, { rootMargin: "100% 0px" });
        near.observe(card);
      }
      onceInView(art, 0.9, (moving) => {
        const row = $$(".coach-card", card.parentElement).filter((c) => c.offsetTop === card.offsetTop);
        const wait = moving ? row.filter((c) => c.offsetLeft < card.offsetLeft).length * 150 : 0;
        setTimeout(() => {
          card.classList.add("card-in");
          if (!moving || !art.dataset.build) { still(); return; }
          go = true;
          setTimeout(start, 250);                    // the card is mostly up before the build starts
          setTimeout(() => { if (!started) still(); }, 4000);
        }, wait);
      });
    }
    if (reduced || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    const lean = (x, y) => [img, clip].forEach((el) => { if (!el) return; el.style.setProperty("--px", `${x * -12}px`); el.style.setProperty("--py", `${y * -9}px`); });
    card.addEventListener("pointermove", (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = card.getBoundingClientRect();
        lean((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
      });
    });
    card.addEventListener("pointerleave", () => { cancelAnimationFrame(frame); frame = 0; [img, clip].forEach((el) => { if (el) { el.style.removeProperty("--px"); el.style.removeProperty("--py"); } }); });
  });

  /* ---- Footer year ---- */
  const initYear = () => $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---- The theme switch ----
     After the footer switches on cursor.com and vercel.com: System, Light,
     Dark, in the footer of every page. A choice is stamped on the root as
     data-theme and kept in localStorage, which the one-line script in each
     head reads before first paint so a dark page never flashes paper.
     System removes the stamp and lets the reader's setting decide. The
     canvases hear "themechange" and redraw in the new register. */
  const initTheme = () => {
    const foot = $("footer");
    if (!foot) return;
    const box = document.createElement("div");
    box.className = "theme";
    box.innerHTML = `<div class="seg" role="group" aria-label="Theme">${
      [["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button class="seg-tab" type="button" data-theme-key="${k}" aria-pressed="false">${l}</button>`).join("")}</div>`;
    foot.append(box);
    const tabs = $$(".seg-tab", box);
    const current = () => { try { return localStorage.getItem("theme") || "system"; } catch (e) { return "system"; } };
    const mark = (key) => tabs.forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.themeKey === key)));
    const apply = (key) => {
      if (key === "dark" || key === "light") document.documentElement.dataset.theme = key;
      else delete document.documentElement.dataset.theme;
      try { if (key === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", key); } catch (e) { /* private mode */ }
      mark(key);
      document.dispatchEvent(new CustomEvent("themechange"));
    };
    mark(current());
    tabs.forEach((t) => t.addEventListener("click", () => apply(t.dataset.themeKey)));
    // The system setting can change underneath a reader who chose System.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (current() === "system") document.dispatchEvent(new CustomEvent("themechange")); });
  };

  [initUnlock, initLinks, initNav, initReveal, initTabs, initCarousels, initWalkthroughs, initStory, initRun, initCoach, initFields, initCharts, initMatrix, initConfig, initFlows, initBeforeAfter, initStrips, initTableWraps, initPortrait, initClock, initArcade, initStack, initLens, initSteps, initDemo, initPalette, initPostList, initChat, initYear, initTheme, initTalk]
    .forEach((init) => { try { init(); } catch (err) { console.error(`main.js: ${init.name} failed`, err); } });
})();
