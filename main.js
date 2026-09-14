/* John DeSouza — portfolio scripts
   1. CONFIG: the only thing you need to edit. Empty values hide their buttons. */
const CONFIG = {
  linkedin: "https://www.linkedin.com/in/johndesouza-/",
  email: "jdesouza90@gmail.com",
  resume: "/assets/john-desouza-resume.pdf",  // empty hides the "Resume" links
};

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Links from CONFIG ---- */
  $$("[data-link]").forEach((el) => {
    const key = el.dataset.link;
    const val = CONFIG[key];
    if (!val) { (el.closest("li") || el).hidden = true; return; }
    el.href = key === "email" ? `mailto:${val}` : val;
    if (key === "resume") { el.download = "John_DeSouza_Resume.pdf"; return; }
    if (key !== "email") { el.target = "_blank"; el.rel = "noopener"; }
  });

  /* ---- Nav ----
     The phone menu is a disclosure: the button reports its state, Escape
     closes it and hands focus back, and following a link closes it. */
  const nav = $(".nav");
  const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  const toggle = $(".nav-toggle");
  if (toggle && nav) {
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
    nav.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !nav.classList.contains("open")) return;
      setOpen(false);
      toggle.focus();
    });
    $$(".nav-links a", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
  }

  /* ---- Scroll reveal ----
     Content is visible by default. JS opts into the animation by marking the
     document, so a failed, blocked or throttled script can never hide a section.
     A failsafe drops the animation if nothing has revealed after 2.5s.

     Every major block is tagged so sections animate in. Anything already
     marked keeps its own order; otherwise each direct child of a section gets
     the next index, which drives the stagger in CSS. */
  $$("main > section, main > div.wrap").forEach((section) => {
    const host = section.querySelector(":scope > .wrap") || section;
    const kids = Array.from(host.children).filter((k) => k.nodeType === 1);
    const list = kids.length ? kids : [section];
    list.forEach((el) => {
      if (el.closest("[data-reveal]") && el.closest("[data-reveal]") !== el) return;
      if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
    });
  });
  // stagger siblings within each parent
  $$("[data-reveal]").forEach((el) => {
    const declared = el.getAttribute("data-reveal");
    const n = declared && /^\d+$/.test(declared)
      ? parseInt(declared, 10) - 1
      : Array.from(el.parentElement ? el.parentElement.children : [])
          .filter((c) => c.hasAttribute && c.hasAttribute("data-reveal"))
          .indexOf(el);
    const i = Number.isFinite(n) ? Math.max(0, Math.min(n, 4)) : 0;
    el.style.setProperty("--reveal-i", String(i));
  });

  const revealEls = $$("[data-reveal]");
  if (!reduced && "IntersectionObserver" in window && revealEls.length) {
    document.documentElement.classList.add("anim");
    const show = (el) => el.classList.add("in");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    revealEls.forEach((el) => io.observe(el));

    // Backstop for the observer. It measures only the elements still hidden and
    // detaches itself once they have all been revealed, so a long page is not
    // paying for a full measure pass on every scroll tick for the rest of the visit.
    const EVENTS = ["scroll", "resize", "load", "pageshow", "hashchange"];
    let pending = revealEls.slice();
    const detach = () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, onMove));
      document.removeEventListener("visibilitychange", onMove);
      io.disconnect();
    };
    const sweep = () => {
      if (!pending.length) return;
      const vh = window.innerHeight;
      const still = [];
      for (const el of pending) {
        if (el.classList.contains("in")) continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.95 && r.bottom > 0) { show(el); io.unobserve(el); }
        else still.push(el);
      }
      pending = still;
      if (!pending.length) detach();
    };
    let queued = false;
    const onMove = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sweep(); });
    };
    EVENTS.forEach((ev) => window.addEventListener(ev, onMove, { passive: true }));
    document.addEventListener("visibilitychange", onMove);
    sweep();
    setTimeout(sweep, 400);
    // Failsafe: if nothing ever revealed, the observer is broken - drop the
    // animation entirely so content is visible. Never blanket-reveal, or
    // everything below the fold is already shown before you scroll to it.
    setTimeout(() => {
      if (!revealEls.some((el) => el.classList.contains("in"))) {
        document.documentElement.classList.remove("anim");
      }
    }, 2500);
  }

  /* ---- Tabs: the three tracking layers ----
     Standard tablist keyboarding (arrows, Home, End; selection follows focus).
     The underline is one element positioned from the selected tab's box, so
     it slides rather than blinks; it is re-measured on resize and once the
     web fonts land, since both change tab widths. */
  $$("[data-tabs]").forEach((root) => {
    const list = $('[role="tablist"]', root);
    const tabs = $$('[role="tab"]', root);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
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
  $$("[data-carousel]").forEach((c) => {
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
  $$(".walk").forEach((w) => {
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

  /* ---- Single-series bar chart ----
     Drawn at 720 wide, or 360 on a phone, where the wide drawing scaled its
     labels to 5px. The narrow drawing keeps the same type, shortens the month
     labels and anchors the annotations so they stay inside the frame. */
  $$("[data-chart]").forEach((el) => {
    const data = JSON.parse(el.dataset.series);
    const annos = JSON.parse(el.dataset.annotations || "[]");
    const fmt = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;
    const full = (v) => "$" + v.toLocaleString("en-US");
    const ns = "http://www.w3.org/2000/svg";
    let drawn = null;
    const draw = () => {
      const narrow = el.clientWidth < 520;
      if (drawn === narrow) return;
      drawn = narrow;
      el.querySelectorAll("svg, .tooltip").forEach((n) => n.remove());
      const W = narrow ? 360 : 720, H = narrow ? 250 : 300;
      const m = narrow ? { t: 48, r: 10, b: 44, l: 46 } : { t: 44, r: 16, b: 44, l: 52 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const max = Math.max(...data.map((d) => d.value));
      const step = Math.pow(10, Math.floor(Math.log10(max)));
      const top = Math.ceil(max / step) * step;
      const y = (v) => m.t + ih - (v / top) * ih;
      const bw = Math.min(narrow ? 36 : 64, (iw / data.length) * 0.5);
      const x = (k) => m.l + (iw / data.length) * (k + 0.5) - bw / 2;
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", el.dataset.label || "Bar chart");
      const add = (tag, attrs, parent = svg, text) => {
        const n = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text != null) n.textContent = text;
        parent.appendChild(n); return n;
      };
      const axis = add("g", { class: "axis" });
      for (let g = 0; g <= 4; g++) {
        const v = (top / 4) * g;
        add("line", { class: "grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, axis);
        add("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, axis, fmt(v).replace(".00", ""));
      }
      const tip = document.createElement("div");
      tip.className = "tooltip";
      el.appendChild(tip);
      data.forEach((d, k) => {
        const bx = x(k), by = y(d.value), h = Math.max(2, m.t + ih - by);
        const r = Math.min(4, h);
        const path = `M${bx},${m.t + ih} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
        const bar = add("path", { class: "bar", d: path });
        // "Oct 2025" becomes "Oct" over "'25" on a phone
        const parts = d.label.split(" ");
        const label = narrow && parts.length > 1 ? parts[0] : d.label;
        const sub = narrow && parts.length > 1 ? "'" + parts[1].slice(-2) : d.sub;
        add("text", { x: bx + bw / 2, y: m.t + ih + 18, "text-anchor": "middle" }, axis, label);
        if (sub) add("text", { x: bx + bw / 2, y: m.t + ih + 32, "text-anchor": "middle", style: narrow ? "" : "font-size:9.5px" }, axis, sub);
        if (k === data.length - 1 || d.callout) add("text", { class: "val", x: bx + bw / 2, y: by - 8, "text-anchor": "middle" }, svg, fmt(d.value));
        const hit = add("rect", { class: "hit", x: bx - 12, y: m.t, width: bw + 24, height: ih });
        const showTip = () => {
          tip.innerHTML = `<b>${full(d.value)}</b>${d.label}${d.sub ? " · " + d.sub : ""}`;
          const box = el.getBoundingClientRect(), sb = svg.getBoundingClientRect();
          const sx = sb.width / W;
          tip.style.left = `${sb.left - box.left + (bx + bw / 2) * sx}px`;
          tip.style.top = `${sb.top - box.top + by * sx}px`;
          tip.classList.add("show"); bar.classList.add("hover");
        };
        const hideTip = () => { tip.classList.remove("show"); bar.classList.remove("hover"); };
        [hit, bar].forEach((n) => { n.addEventListener("mouseenter", showTip); n.addEventListener("mousemove", showTip); n.addEventListener("mouseleave", hideTip); });
      });
      annos.forEach((a, i) => {
        const ax = x(a.at) + bw / 2;
        const right = narrow && ax > W / 2;          // anchor to the left of the line so the text stays in frame
        const ty = narrow ? 12 + (i % 2) * 14 : 12;  // stagger rows on a phone so two notes never collide
        add("line", { class: "anno-line", x1: ax, x2: ax, y1: ty + 4, y2: y(data[a.at].value) - 18 });
        add("text", { class: "anno", x: ax + (right ? -6 : 6), y: ty, "text-anchor": right ? "end" : "start" }, svg, a.text);
      });
      el.insertBefore(svg, el.querySelector("details"));
    };
    draw();
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
  });

  /* ---- Swipe strips ----
     On a phone the flow, gallery and three-up hero scroll sideways. A region
     that scrolls has to be reachable from the keyboard, so it gets a tab stop
     only while it actually overflows. */
  const strips = $$(".flow, .gallery, .hero-panel.three");
  const stops = () => strips.forEach((s) => {
    if (s.scrollWidth > s.clientWidth + 1) {
      s.tabIndex = 0;
      if (s.tagName !== "FIGURE") s.setAttribute("role", "group");
      s.setAttribute("aria-label", "Screens, scroll sideways");
    } else { s.removeAttribute("tabindex"); s.removeAttribute("aria-label"); if (s.tagName !== "FIGURE") s.removeAttribute("role"); }
  });
  stops();
  window.addEventListener("resize", () => { clearTimeout(stops.t); stops.t = setTimeout(stops, 120); });
  window.addEventListener("load", stops);

  /* ---- About: the portrait stands as tall as the text beside it ----
     Its column is the text's height at the photo's own ratio, so it scales
     with the type instead of the row. CSS falls back to a fixed share of the
     row without this, and the stacked layout under 900px ignores it. */
  (() => {
    const grid = $(".about-grid");
    if (!grid || !("ResizeObserver" in window)) return;
    const text = $(".about-text", grid), img = $(".portrait img", grid);
    if (!text || !img) return;
    const ratio = img.getAttribute("width") / img.getAttribute("height");
    new ResizeObserver(([en]) => grid.style.setProperty("--portrait-w", `${en.contentRect.height * ratio}px`)).observe(text);
  })();

  /* ---- Footer year ---- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
