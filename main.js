/* John DeSouza — portfolio scripts
   1. CONFIG: the only thing you need to edit. Empty values hide their buttons. */
const CONFIG = {
  linkedin: "https://www.linkedin.com/in/johndesouza-/",
  email: "jdesouza90@gmail.com",
  resume: "",           // e.g. "assets/john-desouza-resume.pdf" → shows "Resume" links
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
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
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
      list.style.setProperty("--tab-w", `${t.offsetWidth}px`);
    };
    const select = (i, focus) => {
      current = i;
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

  /* ---- Single-series bar chart ---- */
  $$("[data-chart]").forEach((el) => {
    const data = JSON.parse(el.dataset.series);
    const annos = JSON.parse(el.dataset.annotations || "[]");
    const fmt = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;
    const full = (v) => "$" + v.toLocaleString("en-US");
    const W = 720, H = 300, m = { t: 44, r: 16, b: 44, l: 52 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(...data.map((d) => d.value));
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const y = (v) => m.t + ih - (v / top) * ih;
    const bw = Math.min(64, (iw / data.length) * 0.5);
    const x = (k) => m.l + (iw / data.length) * (k + 0.5) - bw / 2;
    const ns = "http://www.w3.org/2000/svg";
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
      add("text", { x: bx + bw / 2, y: m.t + ih + 18, "text-anchor": "middle" }, axis, d.label);
      if (d.sub) add("text", { x: bx + bw / 2, y: m.t + ih + 32, "text-anchor": "middle", style: "font-size:9.5px" }, axis, d.sub);
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
    annos.forEach((a) => {
      const ax = x(a.at) + bw / 2;
      add("line", { class: "anno-line", x1: ax, x2: ax, y1: 14, y2: y(data[a.at].value) - 18 });
      add("text", { class: "anno", x: ax + 6, y: 12 }, svg, a.text);
    });
    el.insertBefore(svg, el.querySelector("details"));
  });

  /* ---- Footer year ---- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
