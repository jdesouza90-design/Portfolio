/* The activity dashboard (admin/index.html): polls /api/activity every few
   seconds, reads sessions out of the views and time beacons, draws the visits
   chart, the session-length histogram and the map, tallies the period and
   keeps the live feed newest-first. Sized and coloured by the same tokens as
   the site (styles.css, section 12). */
(() => {
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 3000;
  const HOUR = 3600000, DAY = 24 * HOUR;
  const GAP = 30 * 60000;         // a quiet half hour ends a session
  const LIVE = 2 * 60000;         // a beacon this recent means they are still here (main.js sends one a minute)
  const KEEP = 4000;              // matches FEED_KEEP in middleware.js
  const NAMES = {
    '/': 'Home', '/index.html': 'Home', '/work.html': 'Work',
    '/work/cross-sell.html': 'Cross-Sell', '/work/verifications.html': 'Verifications',
    '/work/refinance-offers.html': 'Refinance offers', '/work/staking.html': 'Staking',
    '/work/no-code-tools.html': 'No-code tools', '/work/sign-in-with-ethereum.html': 'Sign-in with Ethereum',
    '/work/design-system-audit-agent.html': 'Design system audit agent',
  };
  const pageName = (p) => NAMES[p] || p.replace(/^\/work\//, '').replace(/\.html$/, '') || p;
  const refName = (r) => {
    if (!r || r === 'direct') return 'Direct';
    if (r.startsWith('/')) return 'On the site';
    try { return new URL(r).hostname.replace(/^www\./, ''); } catch (_) { return r; }
  };
  const KIND = { viewed: 'View', unlocked: 'Unlocked', 'wrong password': 'Wrong password' };
  const isVisit = (e) => e.kind in KIND;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The one period control. Days are calendar days so a bar is a whole day;
  // the 24-hour view is the last 24 clock hours, the current one included.
  const RANGES = {
    day:   { label: 'last 24 hours', buckets: 24, step: HOUR },
    week:  { label: 'last 7 days',   buckets: 7,  step: DAY },
    month: { label: 'last 30 days',  buckets: 30, step: DAY },
  };
  let range = 'week';
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const startOfHour = (t) => { const d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime(); };
  const bucketStart = (k, now) => {                    // the moment bucket k of the current range begins
    const r = RANGES[range];
    if (r.step === HOUR) return startOfHour(now) - (r.buckets - 1 - k) * HOUR;
    const d = new Date(startOfDay(now)); d.setDate(d.getDate() - (r.buckets - 1 - k)); return d.getTime();
  };
  const rangeStart = (now) => bucketStart(0, now);
  const bucketOf = (t, now) => {                       // which bucket a moment falls in, DST shifts and all
    const r = RANGES[range];
    if (r.step === HOUR) return Math.floor((t - rangeStart(now)) / HOUR);
    return Math.round((startOfDay(t) - rangeStart(now)) / DAY);
  };

  let events = [];            // newest first, views and time beacons alike
  let total = 0;
  let lastT = 0;
  let timer = null;
  let lastOk = 0;
  const seen = new Set();
  const key = (e) => `${e.t}|${e.visitor}|${e.page}`;
  const live = $('live'), liveLabel = $('live-label');

  const setLive = (state, label) => { live.dataset.state = state; liveLabel.textContent = label; };
  const n = (x) => x.toLocaleString('en-US');

  function ago(t, now) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  const stamp = (t) => new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  // A length of time, the way a stopwatch would say it: 38s, 2m 10s, 1h 12m.
  const dur = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  };
  const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((p, q) => p - q); const i = a.length >> 1; return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; };

  function tally(list, k) {
    const m = new Map();
    for (const e of list) { const x = k(e); m.set(x, (m.get(x) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderList(id, rows, limit = 8) {
    const ol = $(id), empty = $(id + '-empty');
    ol.replaceChildren();
    const top = rows.slice(0, limit);
    const max = top.length ? top[0][1] : 1;
    for (const [label, count] of top) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dash-bar" style="--w:${Math.round(100 * count / max)}%"></span><span class="dash-label"></span><span class="dash-count"></span>`;
      li.querySelector('.dash-label').textContent = label;
      li.querySelector('.dash-count').textContent = n(count);
      ol.appendChild(li);
    }
    empty.hidden = top.length > 0;
  }

  // ---- Sessions: one person's events in a row, split at a quiet half hour ----
  // Length is first event to last signal (a time beacon counts), the way
  // analytics tools define it; a lone view with no beacon has no length.
  function buildSessions(list, now) {
    const by = new Map();
    for (const e of list) { const a = by.get(e.visitor); if (a) a.push(e); else by.set(e.visitor, [e]); }
    const out = [];
    for (const [visitor, evs] of by) {
      evs.sort((a, b) => a.t - b.t);
      let s = null;
      for (const e of evs) {
        if (!s || e.t - s.end > GAP) { s = { visitor, start: e.t, end: e.t, views: [], unlocks: 0, beacons: 0, where: '', device: '' }; out.push(s); }
        s.end = Math.max(s.end, e.t);
        if (e.kind === 'time') s.beacons++;
        else if (e.kind === 'viewed') { s.views.push(e); if (!s.where) { s.where = e.where; s.device = e.device; } }
        else if (e.kind === 'unlocked') s.unlocks++;
      }
    }
    for (const s of out) {
      s.length = s.end > s.start ? s.end - s.start : (s.beacons ? 0 : null);
      s.live = now - s.end < LIVE;
    }
    return out.filter((s) => s.views.length).sort((a, b) => b.end - a.end);
  }

  // Each time beacon belongs to the latest view of that page by that visitor;
  // the view keeps the longest reading, which is the time the page was read.
  function timeOnPages(views, beacons) {
    const idx = new Map();
    for (const v of views) { v.secs = undefined; const k = `${v.visitor}|${v.page}`; const a = idx.get(k); if (a) a.push(v); else idx.set(k, [v]); }
    for (const a of idx.values()) a.sort((x, y) => x.t - y.t);
    for (const b of beacons) {
      const a = idx.get(`${b.visitor}|${b.page}`);
      if (!a) continue;
      let lo = 0, hi = a.length - 1, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (a[mid].t <= b.t) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      if (best >= 0 && !(a[best].secs >= b.secs)) a[best].secs = b.secs;
    }
  }

  // ---- The map: one dot per place, sized by visits; the newest arrival pulses ----
  let map = null, dots = null, fitted = false;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function ensureMap() {
    if (map || !window.L) return map;
    map = L.map('map', { worldCopyJump: true, minZoom: 1, maxZoom: 16, zoomControl: true, attributionControl: true });
    // Esri's light grey canvas: no key needed, quiet enough to sit on the paper. Base, then the labels over the dots.
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_{layer}/MapServer/tile/{z}/{y}/{x}';
    L.tileLayer(esri, { layer: 'Base', maxZoom: 16, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors' }).addTo(map);
    map.createPane('labels').style.zIndex = 450;   // above the dots, below popups
    L.tileLayer(esri, { layer: 'Reference', maxZoom: 16, pane: 'labels', opacity: .9 }).addTo(map);
    map.setView([30, 0], 1);
    dots = L.layerGroup().addTo(map);
    $('map-fit').addEventListener('click', () => fitAll(true));
    return map;
  }
  function fitAll(animate) {
    if (!map || !dots) return;
    const pts = dots.getLayers().map((d) => d.getLatLng());
    if (!pts.length) { map.setView([30, 0], 1, { animate }); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 9, animate });
    fitted = true;
  }
  const marks = new Map();    // place key → its dot, updated in place so an open popup survives a poll
  const escHtml = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderMap(list, now) {
    if (!ensureMap()) return;
    const places = new Map();
    for (const e of list) {
      if (typeof e.lat !== 'number' || typeof e.lon !== 'number') continue;
      const k = `${e.lat},${e.lon}`;
      const p = places.get(k) || { lat: e.lat, lon: e.lon, where: e.where, n: 0, last: 0, visitors: new Set() };
      p.n++; p.visitors.add(e.visitor); if (e.t > p.last) p.last = e.t;
      places.set(k, p);
    }
    const newest = [...places.values()].sort((a, b) => b.last - a.last)[0];
    const accent = css('--accent') || '#3B6B44', paper = css('--surface') || '#fff';
    for (const [k, dot] of marks) if (!places.has(k)) { dots.removeLayer(dot); marks.delete(k); }
    for (const [k, p] of places) {
      const people = p.visitors.size;
      const popup = `<b>${escHtml(p.where)}</b><br>${n(p.n)} view${p.n === 1 ? '' : 's'} from ${n(people)} visitor${people === 1 ? '' : 's'}<br>Last ${ago(p.last, now)}`;
      const radius = Math.min(18, 5 + 2.5 * Math.sqrt(p.n));
      const fresh = p === newest && now - p.last < HOUR;
      let dot = marks.get(k);
      if (!dot) {
        dot = L.circleMarker([p.lat, p.lon], { radius, color: paper, weight: 1.5, fillColor: accent, fillOpacity: .6, className: 'visit-dot' });
        dot.bindPopup(popup).addTo(dots);
        marks.set(k, dot);
      } else {
        dot.setRadius(radius);
        dot.setPopupContent(popup);
      }
      const el = dot.getElement();
      if (el) el.classList.toggle('is-new', fresh);
    }
    $('map-empty').hidden = places.size > 0;
    if (!fitted && places.size) fitAll(false);
  }

  // ---- Visits chart: visitors in the accent over a soft area, views as a grey line behind ----
  // Drawn in the pixels of its box, the way the case-study chart is. The
  // pointer or the arrow keys read one bucket at a time; the table below
  // has every number.
  const chart = (() => {
    const shell = $('chart');
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs, parent, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (text != null) el.textContent = text;
      if (parent) parent.appendChild(el);
      return el;
    };
    const div = (cls, attrs = {}) => { const el = document.createElement('div'); el.className = cls; for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); shell.appendChild(el); return el; };
    const grid = svgEl('svg', { 'aria-hidden': 'true', focusable: 'false' }, shell);
    const lines = div('chart-lines');
    const linesSvg = svgEl('svg', { 'aria-hidden': 'true', focusable: 'false' }, lines);
    const marker = div('chart-marker', { 'aria-hidden': 'true' });
    const node = div('chart-node', { 'aria-hidden': 'true' });
    const tip = div('tooltip', { 'aria-live': 'polite' });
    const hit = div('chart-hit', { tabindex: '0', role: 'group', 'aria-label': 'Visits chart. Left and right arrows step through it.' });

    // A shape-preserving curve (Fritsch–Carlson): through every point, never below zero or over the next.
    const curve = (pts) => {
      const c = pts.length;
      if (c < 2) return '';
      const dx = [], m = [], t = [];
      for (let i = 0; i < c - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
      t[0] = m[0]; t[c - 1] = m[c - 2];
      for (let i = 1; i < c - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
      for (let i = 0; i < c - 1; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
      }
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < c - 1; i++) {
        const h = dx[i] / 3;
        d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
      }
      return d;
    };

    let data = [], geo = null, active = -1, played = reduced || !('animate' in lines);

    const place = (k) => {
      if (!geo || !data[k]) return;
      const { vis, m, ih, W } = geo;
      const p = vis[k], d = data[k];
      tip.replaceChildren();
      const b = document.createElement('b'); b.textContent = d.tip; tip.appendChild(b);
      for (const [cls, label, v] of [['dot', 'Visitors', d.visitors], ['dot dot-views', 'Views', d.views]]) {
        const row = document.createElement('span'); row.className = 'tip-row';
        const dot = document.createElement('span'); dot.className = cls;
        const val = document.createElement('span'); val.className = 'tip-val'; val.textContent = n(v);
        row.append(dot, label, val); tip.appendChild(row);
      }
      marker.style.left = `${p.x}px`;
      node.style.left = `${p.x}px`; node.style.top = `${p.y}px`;
      const tw = tip.offsetWidth || 220, th = tip.offsetHeight || 80;
      const tx = Math.min(Math.max(p.x, tw / 2), W - tw / 2);
      const above = p.y - th - 16;
      tip.style.left = `${tx}px`;
      tip.style.top = `${above >= 0 ? above : Math.min(p.y + 16, m.t + ih - th)}px`;
      for (const el of [tip, marker, node]) el.classList.add('show');
      active = k;
    };
    const clear = () => { for (const el of [tip, marker, node]) el.classList.remove('show'); active = -1; };
    const nearest = (clientX) => {
      const r = hit.getBoundingClientRect();
      return Math.max(0, Math.min(data.length - 1, Math.round(((clientX - r.left) / r.width) * (data.length - 1))));
    };

    const draw = () => {
      const W = shell.clientWidth, H = shell.clientHeight;
      if (!W || !data.length) return;
      const narrow = W < 520;
      const max = Math.max(1, ...data.map((d) => d.views));
      const mag = Math.pow(10, Math.floor(Math.log10(max)));   // a clean step: 1, 2, 5 or a round number, for four or five rules
      const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : mag * (max / mag < 2.5 ? .5 : max / mag < 5 ? 1 : 2);
      const top = Math.max(step, Math.ceil(max / step) * step);
      const m = { t: 18, r: 8, b: 30, l: 14 + 8 * n(top).length };   // room for the widest rule label
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const y = (v) => m.t + ih - (v / top) * ih;
      const x = (k) => m.l + (iw * k) / (data.length - 1);
      const vis = data.map((d, k) => ({ x: x(k), y: y(d.visitors) }));
      const vws = data.map((d, k) => ({ x: x(k), y: y(d.views) }));
      geo = { m, iw, ih, vis, W, H };

      for (const s of [grid, linesSvg]) { s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('width', W); s.setAttribute('height', H); s.replaceChildren(); }
      for (let v = 0; v <= top; v += step) {
        const gy = y(v);
        svgEl('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: gy, y2: gy }, grid);
        svgEl('text', { class: 'axis', x: m.l - 8, y: gy + 4, 'text-anchor': 'end' }, grid, n(v));
      }
      // Every day is labelled on the week (every other on a phone); the other ranges label every few, and the last one when it has room.
      const every = RANGES[range].step === HOUR ? (narrow ? 8 : 4) : range === 'month' ? (narrow ? 10 : 5) : narrow ? 2 : 1;
      data.forEach((d, k) => {
        const last = k === data.length - 1;
        if (k % every !== 0 && !(last && k % every >= every / 2)) return;
        svgEl('text', { class: 'axis', x: vis[k].x, y: H - 8, 'text-anchor': k === 0 ? 'start' : last ? 'end' : 'middle' }, grid, d.label);
      });

      const defs = svgEl('defs', {}, linesSvg);
      const lg = svgEl('linearGradient', { id: 'dash-area', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '.22' }, lg);
      svgEl('stop', { offset: '55%', 'stop-color': 'var(--accent)', 'stop-opacity': '.08' }, lg);
      svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }, lg);
      svgEl('path', { class: 'line line-views', d: curve(vws) }, linesSvg);
      const d = curve(vis);
      svgEl('path', { d: `${d} L${vis[vis.length - 1].x},${m.t + ih} L${vis[0].x},${m.t + ih} Z`, fill: 'url(#dash-area)' }, linesSvg);
      svgEl('path', { class: 'line', d }, linesSvg);

      Object.assign(hit.style, { left: `${m.l}px`, top: `${m.t}px`, width: `${iw}px`, height: `${ih}px` });
      marker.style.top = `${m.t}px`; marker.style.height = `${ih}px`;
      lines.style.clipPath = played ? '' : 'inset(0 100% 0 0)';
      if (active >= 0) place(active);
    };
    const play = () => {   // the first drawing sweeps open, as the case-study chart does; later ones just update
      if (played) return;
      played = true;
      lines.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 1400, easing: 'cubic-bezier(.19, 1, .22, 1)', fill: 'both' })
        .finished.then(() => { lines.style.clipPath = ''; }, () => {});
    };

    hit.addEventListener('pointermove', (e) => place(nearest(e.clientX)));
    hit.addEventListener('pointerdown', (e) => place(nearest(e.clientX)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') clear(); });   // a tap keeps its card
    document.addEventListener('pointerdown', (e) => { if (active >= 0 && !shell.contains(e.target)) clear(); });
    hit.addEventListener('keydown', (e) => {
      const c = data.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        place(active < 0 ? (dir > 0 ? 0 : c - 1) : (active + dir + c) % c);
      } else if (e.key === 'Home') { e.preventDefault(); place(0); }
      else if (e.key === 'End') { e.preventDefault(); place(c - 1); }
      else if (e.key === 'Escape') clear();
    });
    hit.addEventListener('blur', clear);
    if ('ResizeObserver' in window) {
      let w = shell.clientWidth;
      new ResizeObserver(() => { if (shell.clientWidth !== w) { w = shell.clientWidth; draw(); } }).observe(shell);
    }

    return {
      update(next) {
        data = next;
        if (active >= data.length) active = -1;
        draw();
        const tb = $('chart-data');
        tb.replaceChildren(...data.map((d) => {
          const tr = document.createElement('tr');
          const th = document.createElement('th'); th.scope = 'row'; th.textContent = d.tip;
          const a = document.createElement('td'); a.textContent = n(d.visitors);
          const b = document.createElement('td'); b.textContent = n(d.views);
          tr.append(th, a, b);
          return tr;
        }));
        if (!played) requestAnimationFrame(play);
      },
      reset() { clear(); },
    };
  })();

  // The buckets of the current range, each with its visitors and views.
  function buckets(list, now) {
    const r = RANGES[range];
    const out = Array.from({ length: r.buckets }, (_, k) => {
      const t = bucketStart(k, now), d = new Date(t);
      const hour = d.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', ' ');
      const day = d.toLocaleDateString('en-US', { weekday: 'short' });
      const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const today = t === startOfDay(now);
      return {
        label: r.step === HOUR ? hour : range === 'week' ? (today ? 'Today' : day) : (today ? 'Today' : date),
        tip: r.step === HOUR ? `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${hour}` : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        views: 0, visitors: 0, people: new Set(),
      };
    });
    for (const e of list) {
      const k = bucketOf(e.t, now);
      if (k < 0 || k >= out.length) continue;
      out[k].views++; out[k].people.add(e.visitor);
    }
    for (const b of out) { b.visitors = b.people.size; delete b.people; }
    return out;
  }

  // ---- How long they stay: a column per band of session length ----
  const BANDS = [['<10s', 0, 10], ['10–30s', 10, 30], ['30s–1m', 30, 60], ['1–3m', 60, 180], ['3–10m', 180, 600], ['10m+', 600, Infinity]];
  function renderHist(sessions) {
    const box = $('hist'), ns = 'http://www.w3.org/2000/svg';
    const timed = sessions.filter((s) => s.length != null);
    const counts = BANDS.map(([label, lo, hi]) => [label, timed.filter((s) => s.length / 1000 >= lo && s.length / 1000 < hi).length, lo, hi]);
    const W = box.clientWidth || 320, H = box.clientHeight || 200;
    const max = Math.max(1, ...counts.map((c) => c[1]));
    const m = { t: 22, b: 26 }, ih = H - m.t - m.b, slot = W / BANDS.length, bw = Math.min(24, slot * .55);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true');
    counts.forEach(([label, count], k) => {
      const x = slot * k + slot / 2, h = Math.round((count / max) * ih), y0 = m.t + ih, y1 = y0 - h, r = Math.min(4, h);
      const g = document.createElementNS(ns, 'g');
      const title = document.createElementNS(ns, 'title'); title.textContent = `${label}: ${n(count)} session${count === 1 ? '' : 's'}`; g.appendChild(title);
      const bar = document.createElementNS(ns, 'path');
      bar.setAttribute('class', 'col');
      bar.setAttribute('d', h ? `M${x - bw / 2},${y0} V${y1 + r} Q${x - bw / 2},${y1} ${x - bw / 2 + r},${y1} H${x + bw / 2 - r} Q${x + bw / 2},${y1} ${x + bw / 2},${y1 + r} V${y0} Z` : `M${x - bw / 2},${y0} h${bw} v-1 h-${bw} Z`);
      g.appendChild(bar);
      const val = document.createElementNS(ns, 'text');
      val.setAttribute('class', 'cap'); val.setAttribute('x', x); val.setAttribute('y', y1 - 7); val.setAttribute('text-anchor', 'middle'); val.textContent = n(count);
      g.appendChild(val);
      const lab = document.createElementNS(ns, 'text');
      lab.setAttribute('class', 'axis'); lab.setAttribute('x', x); lab.setAttribute('y', H - 8); lab.setAttribute('text-anchor', 'middle'); lab.textContent = label;
      g.appendChild(lab);
      svg.appendChild(g);
    });
    box.replaceChildren(svg);
    const untimed = sessions.length - timed.length;
    const med = median(timed.map((s) => s.length));
    $('hist-note').textContent = timed.length
      ? `${n(timed.length)} session${timed.length === 1 ? '' : 's'}, median ${dur(med)}.${untimed ? ` ${n(untimed)} more had no reading.` : ''}`
      : 'No session lengths yet. They arrive with the time beacons from the pages.';
    $('hist-data').replaceChildren(...counts.map(([label, count, lo, hi]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.scope = 'row';
      th.textContent = hi === Infinity ? `Over ${dur(lo * 1000)}` : lo === 0 ? `Under ${dur(hi * 1000)}` : `${dur(lo * 1000)} to ${dur(hi * 1000)}`;
      const td = document.createElement('td'); td.textContent = n(count);
      tr.append(th, td);
      return tr;
    }));
  }

  // ---- Sessions table ----
  function renderSessions(sessions, now) {
    const tb = $('sessions');
    tb.replaceChildren(...sessions.slice(0, 40).map((s) => {
      const tr = document.createElement('tr');
      if (s.live) tr.dataset.live = '1';
      const route = s.views.map((v) => pageName(v.page)).filter((name, i, a) => name !== a[i - 1]);   // a reload is not a second page
      const cells = [
        ['time', ago(s.start, now), stamp(s.start)],
        ['where', s.where || 'unknown', '', 'Where'],
        ['route', route.join(' → '), route.length > 3 ? route.join(' → ') : '', 'Pages'],
        ['length', s.length == null ? '–' : dur(s.length), s.length == null ? 'No time beacon arrived for this visit' : '', 'Length'],
        ['device', s.device || '', '', 'Device'],
        ['visitor', s.visitor || '', '', 'Visitor'],
      ];
      for (const [cls, text, title, label] of cells) {
        const td = document.createElement('td');
        td.className = `c-${cls}`;
        if (label) td.dataset.label = label;
        td.textContent = text;
        if (title && title !== text) td.title = title;
        if (cls === 'time' && s.live) { const b = document.createElement('span'); b.className = 'dash-now'; b.textContent = 'Now'; td.appendChild(b); }
        if (cls === 'route' && s.unlocks) { const b = document.createElement('span'); b.className = 'dash-kind'; b.textContent = s.unlocks === 1 ? 'Unlocked' : `${s.unlocks} unlocks`; td.appendChild(b); }
        tr.appendChild(td);
      }
      return tr;
    }));
    $('sessions-empty').hidden = sessions.length > 0;
  }

  // ---- Everything the period scopes, and the strip above it ----
  let sessions = [];
  function renderStats(now) {
    const today = startOfDay(now);
    const visits = events.filter(isVisit), beacons = events.filter((e) => e.kind === 'time');
    const views = visits.filter((e) => e.kind === 'viewed');
    timeOnPages(views, beacons);
    const all = buildSessions(events, now);
    const here = all.filter((s) => s.live);
    const todays = visits.filter((e) => e.t >= today);
    const todaysViews = todays.filter((e) => e.kind === 'viewed');
    $('s-now').textContent = n(here.length);
    $('s-views').textContent = n(todaysViews.length);
    $('s-visitors').textContent = n(new Set(todaysViews.map((e) => e.visitor)).size);
    $('s-unlocks').textContent = n(todays.filter((e) => e.kind === 'unlocked').length);
    $('s-total').textContent = n(total);

    const start = rangeStart(now);
    const inRange = views.filter((e) => e.t >= start);
    renderList('where', tally(inRange, (e) => e.where || 'unknown'));
    renderList('pages', tally(inRange, (e) => pageName(e.page)));
    renderList('refs', tally(inRange, (e) => refName(e.ref)));
    renderList('devices', tally(inRange, (e) => e.device || 'unknown'));
    renderMap(inRange, now);
    chart.update(buckets(inRange, now));
    sessions = all.filter((s) => s.start >= start);
    renderHist(sessions);
    renderSessions(sessions, now);

    const latest = views[0];
    const reading = here.map((s) => pageName(s.views[s.views.length - 1].page));
    $('summary').textContent = here.length
      ? `${here.length === 1 ? 'One person is' : `${n(here.length)} people are`} on the site right now, reading ${[...new Set(reading)].slice(0, 3).join(', ')} · ${n(todaysViews.length)} view${todaysViews.length === 1 ? '' : 's'} today`
      : latest
        ? `Nobody right now · Last visit ${ago(latest.t, now)} from ${latest.where || 'somewhere unknown'} · ${n(todaysViews.length)} view${todaysViews.length === 1 ? '' : 's'} today`
        : 'No visits recorded yet. They will appear here as people arrive.';
  }

  // ---- Feed filters: each select narrows the feed to one value of its column ----
  // The options are whatever the feed has seen, commonest first, so a list is
  // never longer than the site's traffic. A chosen value stays listed until
  // it is cleared, even after the last event with it has rolled out.
  const filter = { kind: '', page: '', where: '', ref: '', device: '' };
  const FACET = {
    kind:   (e) => e.kind,
    page:   (e) => pageName(e.page),
    where:  (e) => e.where || 'unknown',
    ref:    (e) => refName(e.ref),
    device: (e) => e.device || 'unknown',
  };
  const filtering = () => Object.values(filter).some(Boolean);
  const matches = (e) => Object.keys(FACET).every((k) => !filter[k] || FACET[k](e) === filter[k]);
  const selects = [...document.querySelectorAll('.dash-filters select')];
  const listed = {};          // facet → the options last drawn, so an unchanged list is left alone
  function renderFilters(visits) {
    for (const sel of selects) {
      const k = sel.dataset.filter;
      const values = k === 'kind' ? Object.keys(KIND) : tally(visits, FACET[k]).map(([v]) => v);
      if (filter[k] && !values.includes(filter[k])) values.push(filter[k]);
      const sig = values.join('\n');
      if (sig === listed[k] || document.activeElement === sel) continue;   // never rebuild under an open menu
      listed[k] = sig;
      const all = sel.firstElementChild;                                    // the "all" option comes from the markup
      sel.replaceChildren(all, ...values.map((v) => { const o = document.createElement('option'); o.value = v; o.textContent = k === 'kind' ? KIND[v] : v; return o; }));
      sel.value = filter[k];
    }
  }
  function refilter() {
    $('feed').replaceChildren();
    rows.clear();
    renderFeed([]);
  }
  $('feed-filters').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-filter]');
    if (!sel) return;
    filter[sel.dataset.filter] = sel.value;
    sel.parentElement.classList.toggle('is-on', sel.value !== '');
    refilter();
  });
  $('feed-clear').addEventListener('click', () => {
    for (const k in filter) filter[k] = '';
    for (const sel of selects) { sel.value = ''; sel.parentElement.classList.remove('is-on'); }
    refilter();
    selects[0].focus();
  });

  // ---- The feed ----
  const rows = new Map();     // event key → its row, so a time reading can land on it later
  function row(e, fresh) {
    const tr = document.createElement('tr');
    tr.dataset.t = e.t;
    tr.dataset.key = key(e);
    if (fresh) tr.className = 'is-new';
    tr.dataset.kind = e.kind;
    const cells = [
      ['time', ago(e.t, Date.now()), stamp(e.t)],
      ['kind', KIND[e.kind] || e.kind],
      ['page', pageName(e.page), e.page],
      ['secs', e.kind !== 'viewed' ? '' : e.secs == null ? '–' : dur(e.secs * 1000), '', 'Time'],
      ['where', e.where || 'unknown', '', 'Where'],
      ['ref', refName(e.ref), e.ref, 'Sent by'],
      ['device', e.device || '', '', 'Device'],
      ['visitor', e.visitor || '', '', 'Visitor'],
    ];
    for (const [cls, text, title, label] of cells) {
      const td = document.createElement('td');
      td.className = `c-${cls}`;
      if (label) td.dataset.label = label;             // the phone layer stacks the row and labels each cell
      if (cls === 'kind') { const b = document.createElement('span'); b.className = 'dash-kind'; b.textContent = text; td.appendChild(b); }
      else td.textContent = text;
      if (title && title !== text) td.title = title;
      tr.appendChild(td);
    }
    rows.set(tr.dataset.key, tr);
    return tr;
  }

  function renderFeed(fresh) {
    const tb = $('feed');
    const visits = events.filter(isVisit);
    const shown = (e) => isVisit(e) && matches(e);
    if (!tb.children.length) {                       // first paint, or a new filter: everything at once
      tb.replaceChildren(...visits.filter(matches).slice(0, 200).map((e) => row(e, false)));
    } else {
      for (const e of [...fresh].reverse()) if (shown(e)) tb.prepend(row(e, true));   // newest ends up on top
      while (tb.children.length > 200) { rows.delete(tb.lastElementChild.dataset.key); tb.lastElementChild.remove(); }
    }
    for (const e of events) {                        // readings that arrived since the row was drawn
      if (e.kind !== 'viewed' || e.secs == null) continue;
      const tr = rows.get(key(e));
      if (!tr) continue;
      const td = tr.querySelector('.c-secs'), text = dur(e.secs * 1000);
      if (td.textContent !== text) td.textContent = text;
    }
    renderFilters(visits);
    const on = filtering();
    if (on) {
      const count = visits.filter(matches).length;
      $('feed-count').textContent = `${n(count)} of ${n(visits.length)} ${count === 1 ? 'matches' : 'match'}${count > 200 ? ' · newest 200 shown' : ''}`;
    }
    $('feed-state').hidden = !on;
    $('feed-empty').textContent = on ? 'Nothing matches these filters.' : 'Nothing yet. Visits appear here as people arrive.';
    $('feed-empty').hidden = tb.children.length > 0;
  }

  function tickClock() {                             // relative times drift; refresh the words
    const now = Date.now();
    for (const tr of $('feed').children) tr.firstElementChild.textContent = ago(Number(tr.dataset.t), now);
    if (events[0]) renderStats(now);
  }

  // ---- The period control ----
  const tabs = $('range');
  const setTabLine = () => {
    const t = tabs.querySelector('[aria-pressed="true"]');
    if (!t) return;
    tabs.style.setProperty('--tab-x', `${t.offsetLeft}px`);
    tabs.style.setProperty('--tab-y', `${t.offsetTop + t.offsetHeight - 2}px`);
    tabs.style.setProperty('--tab-w', String(t.offsetWidth));   // unitless: the track is 1px wide and scaled
  };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b || b.dataset.range === range) return;
    range = b.dataset.range;
    for (const t of tabs.querySelectorAll('[data-range]')) t.setAttribute('aria-pressed', String(t === b));
    for (const el of document.querySelectorAll('[data-period]')) el.textContent = RANGES[range].label;
    setTabLine();
    chart.reset();
    fitted = false;
    if (events.length) renderStats(Date.now());
  });
  window.addEventListener('resize', setTabLine);
  document.fonts?.ready.then(setTabLine);
  setTabLine();
  if ('ResizeObserver' in window) {                  // the histogram is drawn in pixels too
    let w = $('hist').clientWidth;
    new ResizeObserver(() => { if ($('hist').clientWidth !== w) { w = $('hist').clientWidth; if (events.length) renderHist(sessions); } }).observe($('hist'));
  }

  async function poll() {
    try {
      const res = await fetch(`/api/activity${lastT ? `?since=${lastT}` : ''}`, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) { location.reload(); return; }        // cookie gone: back to the gate
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.configured) {
        $('notice').textContent = 'No store is connected yet, so nothing is being kept. Add an Upstash Redis database to the Vercel project (Storage → Create Database) and redeploy; the README has the steps.';
        $('notice').hidden = false;
        setLive('off', 'Not connected');
        $('dash').setAttribute('aria-busy', 'false');
        $('summary').textContent = 'Nothing is being recorded until a store is connected.';
        return;
      }
      const fresh = data.events.filter((e) => !seen.has(key(e)));
      for (const e of fresh) seen.add(key(e));
      if (fresh.length) {
        events = fresh.concat(events).sort((a, b) => b.t - a.t).slice(0, KEEP);
        lastT = events[0].t;
      }
      total = data.total;
      lastOk = Date.now();
      renderStats(Date.now());
      renderFeed(fresh);
      setLive('on', 'Live');
      $('dash').setAttribute('aria-busy', 'false');
    } catch (err) {
      console.error(err);
      setLive('off', lastOk ? `Reconnecting… last update ${ago(lastOk, Date.now())}` : 'Can\'t reach the feed');
    }
  }

  function start() { if (!timer) { poll(); timer = setInterval(poll, POLL_MS); } }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => document.hidden ? (stop(), setLive('paused', 'Paused')) : start());
  setInterval(tickClock, 15000);
  start();
})();
