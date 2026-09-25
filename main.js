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
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Helpers ---- */
  // Tokens from styles.css, so the scripts draw and move in the page's own
  // values: cssVar reads any token, hex a color as #rrggbb, rgb the same as
  // [r, g, b], tint a color as a function of its alpha. Every fallback is
  // the token's value today, for a stylesheet that failed to load.
  const styles = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const hex = (name, fallback) => { const v = cssVar(name, ""); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; };
  const rgb = (name, fallback) => hex(name, fallback).match(/\w\w/g).map((h) => parseInt(h, 16));
  const tint = (name, fallback) => { const c = rgb(name, fallback).join(","); return (alpha) => `rgba(${c},${alpha})`; };
  const EASE = cssVar("--ease", "cubic-bezier(.23, 1, .32, 1)");
  const EASE_IN_OUT = cssVar("--ease-in-out", "cubic-bezier(.77, 0, .175, 1)");
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
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
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
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
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.documentElement.classList.toggle("nav-locked", open);
      if (open) document.addEventListener("touchmove", holdTouch, { passive: false });
      else document.removeEventListener("touchmove", holdTouch);
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
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
    // On first paint the hero counts wherever it sits on screen (a hero never
    // waits for a scroll); every later section waits at the line, so an intro
    // peeking at the bottom of the first screen rises when the reader gets there.
    const hero = $("main > section");
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
        const edge = firstPaint && hero && hero.contains(el) ? vh : line;
        if (r.top < edge && r.bottom > 0) { show(el); io.unobserve(el); }
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
    const accent = hex("--accent", "#3B6B44"), ink = tint("--ink", "#14100C");

    let W = 0, H = 0, dpr = 1;
    const size = () => { W = fig.clientWidth; H = fig.clientHeight; dpr = fitCanvas(c, W, H); };

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
    let raf = 0, acc = 0, since = 0, playing = true;
    const tick = (now) => { frame(acc + (now - since) / 1000); raf = requestAnimationFrame(tick); };
    const sync = () => {
      const run = playing && visible && visible() && !isScrolling();
      if (run && !raf) { since = performance.now(); raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; acc += (performance.now() - since) / 1000; }
      setPaused(btn, playing, "animation");
    };
    let visible = null;
    afterReveal(fig, () => {                       // the still SVG holds the frame until the card has landed
      size();
      fig.classList.add("live");
      frame(0);
      if (btn) { btn.hidden = false; btn.addEventListener("click", () => { playing = !playing; sync(); }); }
      if ("ResizeObserver" in window) new ResizeObserver(() => { size(); frame(acc + (raf ? (performance.now() - since) / 1000 : 0)); }).observe(fig);
      else window.addEventListener("resize", size);
      visible = whileOnScreen(fig, .05, sync);
      whileStill(sync);
      sync();
    });
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
    let raf = 0, prev = 0, t = 0, fresh = true, playing = true, stirring = true;
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
      const run = playing && visible() && !isScrolling();
      if (run && !raf) { fresh = true; raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      setPaused(btn, playing, "animation");
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
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); stirring = true; if (!raf) field.frame(t, 0, p, true); }) : null;
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
    const SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 14.2 9.8 21.5 12l-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2Z"/></svg>';
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
        spec.style.setProperty("--specimen-bg", navy ? "#0B1F3A" : cssVar("--paper", "#F6F4F0"));
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

  /* ---- Recent-posts ticker ----
     The blog's recent strip, looped like craft.do's: the run of posts is
     repeated until it outruns the strip, doubled, and slid one run's width
     per cycle (styles.css, section 13). The copies are inert, so a reader
     tabs through each post once. Hovering or tabbing in holds it, and a
     pause button holds it for good (WCAG 2.2.2). Without JS, or with
     reduced motion, it stays the sideways-scrolling strip. */
  const initTicker = () => {
    const strip = $(".ticker");
    if (!strip || reduced) return;
    const items = $$(".ticker-item", strip);
    if (!items.length) return;
    const frame = document.createElement("div");
    frame.className = "ticker-frame";
    strip.before(frame);
    frame.append(strip);
    const track = document.createElement("div");
    track.className = "ticker-track";
    track.append(...items);
    strip.append(track);
    strip.classList.add("marquee");
    strip.removeAttribute("data-strip-label");
    const copy = (el) => { const c = el.cloneNode(true); c.setAttribute("aria-hidden", "true"); c.inert = true; return c; };
    const run = track.scrollWidth || 1;
    const reps = Math.max(1, Math.ceil(strip.clientWidth / run));
    for (let i = 1; i < reps * 2; i++) items.forEach((el) => track.append(copy(el)));
    strip.style.setProperty("--ticker-dur", `${Math.round((run * reps) / 40)}s`);   // ~40px a second

    const btn = document.createElement("button");
    btn.className = "art-ctl"; btn.type = "button";
    btn.innerHTML = '<svg class="i-pause" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx=".8"/><rect x="9.5" y="3" width="3" height="10" rx=".8"/></svg><svg class="i-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z"/></svg>';
    frame.append(btn);
    let playing = true;
    setPaused(btn, playing, "recent posts");
    btn.addEventListener("click", () => {
      playing = !playing;
      frame.classList.toggle("held", !playing);
      setPaused(btn, playing, "recent posts");
    });
  };

  /* ---- Swipe strips ----
     On a phone the gallery and three-up hero scroll sideways. A region that
     scrolls has to be reachable from the keyboard, so it gets a tab stop only
     while it actually overflows. */
  const initStrips = () => {
    const strips = $$(".gallery, .hero-panel.three, .ticker:not(.marquee)");
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
    const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const INK = tok("--ink") || "#14100C", INK3 = tok("--ink-3") || "#6F675D", HAIR = tok("--hair-2") || "#CFC9BF";
    const ACCENT = tok("--accent") || "#3B6B44", GREEN = tok("--accent-2") || "#6E9A5A", FLAG = tok("--danger") || "#C0392B", SAND = tok("--surface") || "#FFFFFF";
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
       left for clicks made without a pointer or a key (assistive tech). */
    btn.addEventListener("click", (e) => { if (e.detail === 0) act(); });
    btn.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.preventDefault(); btn.focus({ preventScroll: true }); act(); } });
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
      const q = head.value.trim().toLowerCase();
      let shown = 0;
      groups.forEach((g) => {
        let n = 0;
        $$(".post-card", g).forEach((c) => {
          const hit = !q || c.dataset.title.includes(q) || c.dataset.desc.includes(q);
          c.hidden = !hit;
          if (hit) n++;
        });
        g.hidden = q ? n === 0 : false;
        shown += n;
      });
      if (empty) empty.hidden = shown > 0;
    };

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
     carried it is masked. */
  const initChat = () => {
    if (!window.ReadableStream || !window.TextDecoder || !window.HTMLDialogElement) return;
    fetch("/api/chat", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((state) => { if (state && state.ready) buildChat(state); })
      .catch(() => {});
  };

  const buildChat = (state) => {
    const KEY = "chat.v1";
    const INTRO = "I'm an AI assistant. I answer from the pages on this site, so ask about John's projects, how he leads or what he's looking for next.";
    const UNLOCKED = "Unlocked. The case studies are open now, so ask me about the results, the numbers or how the work was done.";
    const phone = window.matchMedia("(max-width: 640px)");
    const fine = window.matchMedia("(pointer: fine)");
    const root = document.documentElement;
    const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
    const ICON = {
      spark: icon('<path d="M10 4.5Q10.9 11.1 17.5 12Q10.9 12.9 10 19.5Q9.1 12.9 2.5 12Q9.1 11.1 10 4.5Z"/><path d="M18.5 2.5Q18.8 4.7 21 5Q18.8 5.3 18.5 7.5Q18.2 5.3 16 5Q18.2 4.7 18.5 2.5Z"/>'),
      close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
      send: icon('<path d="M12 18.5V5.5M6.5 11 12 5.5l5.5 5.5"/>'),
      stop: icon('<rect x="7.5" y="7.5" width="9" height="9" rx="1.5"/>'),
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
    const save = (open) => { try { sessionStorage.setItem(KEY, JSON.stringify({ open, msgs, offered })); } catch (_) { /* nothing to keep it in */ } };

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
    launch.innerHTML = `<span class="chat-launch-sweep" aria-hidden="true"></span>${ICON.spark}<span class="chat-launch-label">${topic.label}</span>`;

    const dlg = make("dialog", "chat");
    dlg.id = "chat";
    dlg.setAttribute("aria-labelledby", "chat-title");
    dlg.innerHTML = `
      <div class="chat-head">
        <div>
          <p class="eyebrow">AI assistant</p>
          <h2 class="t-subhead" id="chat-title" tabindex="-1">${topic.label}</h2>
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
      <p class="sr-only" role="status" id="chat-status"></p>`;
    document.body.append(launch, dlg);
    const log = $(".chat-log", dlg), form = $(".chat-form", dlg), input = $("#chat-input", dlg);
    const send = $(".chat-send", dlg), title = $("#chat-title", dlg), status = $("#chat-status", dlg);

    /* Light Markdown, built as nodes. Links go to the site's own pages, to
       https or to mail; anything else stays text. */
    const inline = (text, into) => {
      const re = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*/g;
      let at = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > at) into.append(text.slice(at, m.index));
        if (m[3]) into.append(make("strong", "", m[3]));
        else if (/^(\/(?![\/\\])|https:\/\/|mailto:)/.test(m[2])) {   // a site path (never //host or /\host), https or mail
          const a = make("a", "", m[1]);
          a.href = m[2];
          if (/^https:/.test(m[2]) && new URL(m[2]).host !== location.host) { a.target = "_blank"; a.rel = "noopener"; }
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
    const stick = (force) => { if (force || pinned) log.scrollTop = log.scrollHeight; };
    const bubble = (role, content) => {
      const m = make("div", `chat-msg is-${role}`);
      if (role === "user") m.append(make("span", "sr-only", "You: "), content);
      else render(content, m);
      log.append(m);
      return m;
    };
    let starters = null;
    const drawLog = () => {
      log.replaceChildren();
      bubble("assistant", INTRO);
      if (!msgs.length && Array.isArray(topic.starters) && topic.starters.length) {
        starters = make("ul", "chat-starters");
        starters.setAttribute("aria-label", "Suggested questions");
        topic.starters.forEach((q) => {
          const b = make("button", "btn btn-ghost btn-sm", q);
          b.type = "button";
          b.addEventListener("click", () => ask(q));
          const li = make("li");
          li.append(b);
          starters.append(li);
        });
        log.append(starters);
      }
      msgs.forEach((m) => bubble(m.role, m.content));
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
      if (starters) { starters.remove(); starters = null; }
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
      const paint = () => { frame = 0; reply.classList.remove("is-waiting"); render(text, reply); stick(); };
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
        msgs.push({ role: "assistant", content: UNLOCKED });
        bubble("assistant", UNLOCKED);
        status.textContent = UNLOCKED;
      } else {
        if (text) { render(text, reply); reply.classList.remove("is-waiting"); msgs.push({ role: "assistant", content: text }); }
        if (failed) {
          if (!text) reply.replaceChildren();
          reply.classList.remove("is-waiting");
          reply.append(make("p", "chat-error", failed));
        }
        if (!text && !failed) reply.remove();          // stopped before a word arrived
        status.textContent = failed || (text ? `Assistant: ${plain(text)}` : "");
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
      card.append(make("p", "chat-offer-text", "Want the full story? I'm happy to walk you through any of this work myself."));
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
    const open = (focus) => {
      clearTimeout(closing);
      if (!dlg.open) {
        if (phone.matches) { dlg.showModal(); root.classList.add("chat-locked"); fit(); }
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
    $(".chat-close", dlg).addEventListener("click", close);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });   // Escape on the modal sheet
    dlg.addEventListener("keydown", (e) => { if (e.key === "Escape" && !phone.matches) { e.preventDefault(); close(); } });
    phone.addEventListener("change", () => { if (!dlg.open) return; dlg.close(); root.classList.remove("chat-locked"); open(false); });
    log.addEventListener("click", (e) => { if (e.target.closest("a[href^='/']")) save(!phone.matches); });   // on to another page: reopen there, except on a phone

    /* The composer: Enter sends, Shift+Enter breaks the line. */
    form.addEventListener("submit", (e) => { e.preventDefault(); if (busy) busy.abort(); else ask(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) ask(); }
    });
    input.addEventListener("input", sync);
    sync();

    drawLog();
    requestAnimationFrame(() => launch.classList.add("is-in"));
    if (saved.open && !phone.matches) open(false);
  };

  /* ---- Footer year ---- */
  const initYear = () => $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  [initUnlock, initLinks, initNav, initReveal, initTabs, initCarousels, initWalkthroughs, initStrands, initFields, initCharts, initMatrix, initConfig, initFlows, initTicker, initStrips, initTableWraps, initPortrait, initClock, initArcade, initPostList, initChat, initYear]
    .forEach((init) => { try { init(); } catch (err) { console.error(`main.js: ${init.name} failed`, err); } });
})();
