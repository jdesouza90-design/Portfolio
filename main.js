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
    // the step on each card selects the next layer; focus follows onto the
    // new card's own step, so a reader can walk the chain without leaving it
    $$("[data-next]", root).forEach((b) => {
      b.addEventListener("click", () => {
        const i = tabs.findIndex((t) => t.id === b.dataset.next);
        if (i < 0) return;
        select(i);
        const step = panels[i] && $(".btn", panels[i]);
        (step || tabs[i]).focus({ preventScroll: true });
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

  /* ---- AI card: the strands, in three dimensions ----
     Eighty-odd strands lie on a horn that narrows to a single line. The horn
     turns slowly about its axis and breathes in perspective, and every strand
     sways on its own. It draws only while the card is on screen and the tab
     is visible, never under reduced motion (the still SVG stays), and the
     button in the corner is the WCAG 2.2.2 stop. */
  $$("[data-strands]").forEach((fig) => {
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
      g.addColorStop(0, "rgba(20,16,12,1)"); g.addColorStop(.55, "rgba(20,16,12,.8)"); g.addColorStop(1, "rgba(20,16,12,0)");
      ctx.strokeStyle = g;
      for (const k of strands) {
        const zn = trace(k, t, rot, XM + .3, M);
        ctx.globalAlpha = .08 + .22 * zn;
        ctx.lineWidth = k.w * (.7 + .6 * zn);
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.strokeStyle = "#3B6B44"; ctx.lineWidth = green.w;
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

  /* ---- Originations chart ----
     A line over a soft area, drawn in the pixels of its box so the type stays
     the same size on a phone. The lines are revealed left to right by a
     clip-path sweep when the card scrolls in, and the closing value lands in a
     pill at the right edge as the sweep does. Hovering, touching or arrowing
     through the plot drops a marker on the nearest month with a card of its
     numbers. The grid, the axes and the table below never move. */
  $$("[data-chart]").forEach((el) => {
    const data = JSON.parse(el.dataset.series);
    const annos = JSON.parse(el.dataset.annotations || "[]");
    const fmt = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;
    const full = (v) => "$" + v.toLocaleString("en-US");
    const short = (label, k, narrow) => {   // "Oct 2025" reads "Oct ’25" on the axis; a phone
      const [mo, yr] = label.split(" ");     // keeps the year only where it starts or changes
      if (!yr) return label;
      const prev = k > 0 ? data[k - 1].label.split(" ")[1] : null;
      return narrow && prev === yr ? mo : `${mo} \u2019${yr.slice(-2)}`;
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
      pill.animate([{ opacity: 0 }, { opacity: 1 }], { delay: 1300, duration: 300, easing: "ease-out", fill: "both" });
    };
    if (!played) {
      pill.style.opacity = "0";
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          setTimeout(play, 120);          // let the card's own reveal lead
        }, { threshold: 0.35 });
        io.observe(shell);
      }
      setTimeout(() => { if (!played) { played = true; lines.style.clipPath = ""; pill.style.opacity = ""; } }, 4000);
    }

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
      let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
    }
  });

  /* ---- Number flow ----
     A headline stat rolls into place like an odometer: every digit is a
     column of 0 to 9 behind a soft mask, and each column turns once around
     to its digit when the stat comes into view. The rest of the string (a
     currency sign, a unit) stands still. Screen readers get the plain text.
     Under reduced motion the stat is left as it was written. */
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
        s.className = "flow-char"; s.textContent = ch === " " ? " " : ch;
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
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); settle(true); } }, { threshold: 0.5 });
      io.observe(el);
      setTimeout(() => settle(false), 4000);            // never leave a stat reading zero
    } else settle(true);
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
