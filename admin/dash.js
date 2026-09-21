/* The activity dashboard (admin/index.html): polls /api/activity every few
   seconds, reads sessions out of the views and time beacons, draws the visits
   chart, the session-length histogram and the map, tallies the period and
   keeps the live feed newest-first. Sized and colored by the same tokens as
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
  // Places worth calling by name rather than by host. Each arrives under
  // several: Greenhouse alone sends a recruiter from my.greenhouse.io,
  // app.greenhouse.io and the job boards, which are all one place as far as
  // "where did this come from" goes. A line each to add another.
  const SOURCES = [
    [/(^|\.)slack\.com$|(^|\.)slack-redir\.net$/, 'Slack'],
    [/(^|\.)greenhouse\.io$/, 'Greenhouse'],
    [/(^|\.)ashbyhq\.com$/, 'Ashby'],
  ];
  const named = (host) => (SOURCES.find(([re]) => re.test(host)) || [])[1] || '';
  // `from:x` is the tag on a shared link (middleware.js), which is how a click
  // out of Slack is known at all: it sends no referrer.
  const tagName = (t) => (SOURCES.find(([, label]) => label.toLowerCase() === t) || [])[1]
    || t.charAt(0).toUpperCase() + t.slice(1);
  const refName = (r) => {
    if (!r || r === 'direct') return 'Direct';
    if (r.startsWith('from:')) return tagName(r.slice(5));
    if (r.startsWith('/')) return 'On the site';
    try { const h = new URL(r).hostname.replace(/^www\./, ''); return named(h) || h; } catch (_) { return r; }
  };
  const KIND = { viewed: 'View', gated: 'Tried to open', unlocked: 'Unlocked', 'wrong password': 'Wrong password' };
  const isVisit = (e) => e.kind in KIND;
  // What became of a case study someone tried to open, the best outcome winning:
  // reaching the gate, then a wrong password, then the unlock.
  const OUTCOME = { gated: 0, 'wrong password': 1, unlocked: 2 };
  const OUTCOME_LABEL = ['At the gate', 'Wrong password', 'Unlocked'];
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
  let blocked = [];           // referrer hosts blocked as spam (the edge keeps the set; www. stripped)
  const refHost = (r) => { if (!r || !/^https?:/.test(r)) return ''; try { return new URL(r).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return ''; } };
  const isSpam = (e) => { const h = refHost(e.ref); return !!h && blocked.some((b) => h === b || h.endsWith(`.${b}`)); };

  // ---- Real visits ----
  // A session is a person's when something in it could only have come from a
  // browser that ran the page: a time beacon, or a password typed into the gate.
  // A link scanner (the ones Outlook, LinkedIn and the mail filters send ahead of
  // every shared link) and a headless crawler take the HTML and leave, so neither
  // ever arrives — which is most of what lands from the cloud regions, Ashburn
  // and Santa Clara above all. Sessions younger than the grace are taken on
  // trust: the first beacon is a minute in, and someone reading right now must
  // not be missing from the dashboard while it is on its way.
  // Nothing here deletes anything. It is all read-time, and the switch undoes it.
  const GRACE = 2 * 60000;
  const REAL_KEY = 'dash.real-only', SECS_KEY = 'dash.real-secs';
  const stored = (k, fallback) => { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch (_) { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode: the choice lasts the visit */ } };
  let realOnly = stored(REAL_KEY, '1') !== '0';
  let minSecs = Number(stored(SECS_KEY, '0')) || 0;
  const ranJS = (s) => s.beacons > 0 || [...s.tried.values()].some((o) => o >= OUTCOME['wrong password']);
  // A visit is kept when its session is a person's and, where a minimum is set,
  // the page was read for that long. A view with no reading of its own counts as
  // none: the beacon it would have come in is exactly what never arrived.
  const isReal = (e) => (!realOnly || !e.session || e.session.human)
    && !(minSecs && e.kind === 'viewed' && !(e.secs >= minSecs));
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

  // `action(label)` may hand a row a button; a list with one is left alone while
  // the button has focus, so a poll never pulls it out from under the keyboard.
  let forceLists = false;     // a block or unblock redraws the lists even under focus, then places it
  function renderList(id, rows, limit = 8, action = null) {
    const ol = $(id), empty = $(id + '-empty');
    const top = rows.slice(0, limit);
    if (!forceLists && ol.contains(document.activeElement)) return;
    ol.replaceChildren();
    const max = top.length ? top[0][1] : 1;
    for (const [label, count] of top) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dash-bar" style="--w:${Math.round(100 * count / max)}%"></span><span class="dash-label"></span><span class="dash-count"></span>`;
      li.querySelector('.dash-label').textContent = label;
      li.querySelector('.dash-count').textContent = n(count);
      const btn = action && action(label);
      if (btn) li.appendChild(btn);
      ol.appendChild(li);
    }
    empty.hidden = top.length > 0;
  }

  // ---- Sessions: one person's events in a row, split at a quiet half hour ----
  // Length is first event to last signal (a time beacon counts), the way
  // analytics tools define it; a lone view with no beacon has no length.
  // `tried` is each case study the person met the password gate on, with how
  // it ended; a session that only ever reached a gate still counts. Each visit
  // event is handed its session, so the feed can show the same on its rows.
  function buildSessions(list, now) {
    const by = new Map();
    for (const e of list) { const a = by.get(e.visitor); if (a) a.push(e); else by.set(e.visitor, [e]); }
    const out = [];
    for (const [visitor, evs] of by) {
      evs.sort((a, b) => a.t - b.t);
      let s = null;
      for (const e of evs) {
        if (!s || e.t - s.end > GAP) { s = { visitor, start: e.t, end: e.t, views: [], tried: new Map(), kinds: new Set(), refs: new Set(), beacons: 0, where: '', device: '' }; out.push(s); }
        s.end = Math.max(s.end, e.t);
        if (e.kind === 'time') { s.beacons++; continue; }
        e.session = s;
        if (!s.where) { s.where = e.where; s.device = e.device; }
        s.kinds.add(e.kind);                       // every kind of event in it, and every source it came by,
        s.refs.add(refName(e.ref));                // so the sessions table can be narrowed by either
        if (e.kind === 'viewed') s.views.push(e);
        else if (e.kind in OUTCOME) s.tried.set(e.page, Math.max(s.tried.get(e.page) ?? -1, OUTCOME[e.kind]));
      }
    }
    for (const s of out) {
      s.length = s.end > s.start ? s.end - s.start : (s.beacons ? 0 : null);
      s.live = now - s.end < LIVE;
      s.human = ranJS(s) || now - s.start < GRACE;
    }
    return out.filter((s) => s.views.length || s.tried.size).sort((a, b) => b.end - a.end);
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

  // A Tried to open cell: each case study met at the gate, with how it ended,
  // or a dash. Both tables draw it; the feed redraws it as outcomes arrive.
  const triedSig = (tried) => [...tried].map(([p, o]) => `${p}:${o}`).join(',');
  // The gate values a visit or a session carries, for either table's Tried to
  // open filter: `any` plus each outcome reached, or `none` if no gate was met.
  const triedValues = (tried) => tried && tried.size
    ? ['any', ...new Set([...tried.values()].map((o) => Object.keys(OUTCOME)[o]))]
    : ['none'];
  function fillTried(td, tried) {
    const sig = triedSig(tried);
    if (td.dataset.sig === sig) return;
    td.dataset.sig = sig;
    td.replaceChildren();
    if (!tried.size) { td.textContent = '–'; return; }
    for (const [page, outcome] of tried) {
      const item = document.createElement('span');
      item.className = 'dash-tried';
      item.append(pageName(page));
      const b = document.createElement('span');
      b.className = 'dash-kind';
      b.dataset.kind = Object.keys(OUTCOME)[outcome];
      b.textContent = OUTCOME_LABEL[outcome];
      item.appendChild(b);
      td.appendChild(item);
    }
  }

  // ---- One visitor ----
  // A hash pressed in the Visitor column of either table follows that
  // person: the feed keeps only their events and the sessions table only
  // their visits, on top of whatever else is set. A chip in each filter
  // row names them and lets go on press; so does pressing the hash again,
  // and either Clear filters.
  let followed = '';
  const shortHash = (v) => v.length > 10 ? `${v.slice(0, 10)}…` : v;
  function visitorCell(td, v) {
    if (!v) { td.textContent = ''; return; }
    const b = document.createElement('button');
    b.className = 'dash-visitor'; b.type = 'button'; b.dataset.visitor = v;
    b.textContent = v; b.title = followed === v ? 'Following this visitor; press to show everyone' : 'Follow this visitor';
    b.setAttribute('aria-pressed', String(followed === v));
    td.appendChild(b);
  }
  function renderFollowed() {
    for (const chip of document.querySelectorAll('.dash-filter-visitor')) {
      chip.hidden = !followed;
      const b = chip.firstElementChild;
      b.replaceChildren();
      if (followed) { const h = document.createElement('span'); h.className = 'dash-hash'; h.textContent = shortHash(followed); b.append('Visitor ', h, ' ×'); }
      b.setAttribute('aria-label', followed ? `Following visitor ${followed}` : '');
    }
    for (const b of document.querySelectorAll('.dash-visitor')) {
      const on = b.dataset.visitor === followed;
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Following this visitor; press to show everyone' : 'Follow this visitor';
    }
  }
  function follow(v) {
    followed = followed === v ? '' : v;
    renderFollowed();
    refilter();
    renderSessions(sessions, Date.now());
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.dash-visitor');
    if (!b) return;
    const section = b.closest('.dash-feed');   // found before the redraw takes the button away
    follow(b.dataset.visitor);
    if (followed) section.querySelector('.dash-filter-visitor button').focus();   // the chip above that table; focus scrolls it in under the nav (scroll-margin) and the narrowed table follows
    else section.querySelector('.dash-filter-multi .dash-filter-btn').focus();   // let go: focus stays in the section
  });
  for (const chip of document.querySelectorAll('.dash-filter-visitor button')) chip.addEventListener('click', () => { follow(followed); chip.closest('.dash-filters').querySelector('.dash-filter-multi .dash-filter-btn').focus(); });


  // ---- A filter menu ----
  // Every filter on both tables is one of these: a pill that opens a list of
  // checkboxes, one a value, all ticked to begin with. Unticking narrows, so
  // any number of values can be kept at once — drop one with a single tick, or
  // press None and pick out the two you want. A value stays listed while it is
  // unticked even after the last visit carrying it rolls out of the log, so a
  // filter never quietly widens again. Nothing ticked shows nothing, and says
  // so. The menu is rebuilt only when its values change and never while it is
  // open, so a poll can't move a checkbox out from under the pointer.
  function multiFilter(wrap, { onChange, label = (v) => v }) {
    const d = wrap.dataset;
    const out = new Set();                     // the unticked values; empty is no filter at all
    let values = [];
    const store = d.remember || '';
    if (store) { try { for (const v of JSON.parse(localStorage.getItem(store)) || []) if (typeof v === 'string') out.add(v); } catch (_) { /* nothing remembered */ } }
    const remember = () => { if (store) { try { localStorage.setItem(store, JSON.stringify([...out])); } catch (_) { /* private mode: the ticks last the visit */ } } };

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dash-filter-btn';
    btn.id = `${d.filter}-btn-${wrap.parentElement.id}`;
    btn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'dash-menu'; menu.hidden = true; menu.id = `${d.filter}-menu-${wrap.parentElement.id}`;
    btn.setAttribute('aria-controls', menu.id);
    const list = document.createElement('fieldset');
    list.className = 'dash-menu-list';
    const legend = document.createElement('legend');
    legend.className = 'sr-only'; legend.textContent = d.legend;
    list.appendChild(legend);
    const foot = document.createElement('div');
    foot.className = 'dash-menu-foot';
    const allBtn = document.createElement('button'); allBtn.type = 'button'; allBtn.textContent = 'All';
    const noneBtn = document.createElement('button'); noneBtn.type = 'button'; noneBtn.textContent = 'None';
    foot.append(allBtn, noneBtn);
    menu.append(list, foot);
    wrap.append(btn, menu);

    const open = () => !menu.hidden;
    // The card hangs from the pill's left edge, which runs off the window for a
    // filter near the right of the row. Slid back by however much it overhangs,
    // never past the left margin, so no menu opens off-screen and the page
    // never gains a sideways scroll.
    function place() {
      menu.style.left = '0px';
      const pad = 12, edge = document.documentElement.clientWidth - pad;
      const over = menu.getBoundingClientRect().right - edge;
      if (over > 0) menu.style.left = `${-Math.min(over, Math.max(0, wrap.getBoundingClientRect().left - pad))}px`;
    }
    const show = (on) => {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) place();
    };
    // What the pill says: the whole list, none of it, the one left out, the one
    // left in, or the count. A short label of the value itself where there is
    // room for one, since that is what the reader is actually looking for.
    const short = (v) => { const t = label(v); return t.length > 18 ? `${t.slice(0, 17)}…` : t; };
    function relabel() {
      const dropped = values.filter((v) => out.has(v)), kept = values.length - dropped.length;
      btn.textContent = !dropped.length ? d.all
        : kept === 0 ? d.none
        : dropped.length === 1 ? `${d.all} but ${short(dropped[0])}`
        : kept === 1 ? `${short(values.find((v) => !out.has(v)))} only`
        : `${kept} of ${values.length} ${d.noun}`;
      btn.title = dropped.length ? `Leaving out ${dropped.map(label).join(', ')}` : '';
      wrap.classList.toggle('is-on', dropped.length > 0);
    }
    function set(next, counts) {
      const all = next.concat([...out].filter((v) => !next.includes(v)));   // an unticked value stays listed after it rolls out
      if (all.join('\n') !== values.join('\n') && !open()) {
        values = all;
        list.replaceChildren(legend, ...values.map((v) => {
          const l = document.createElement('label'); l.className = 'dash-check';
          const i = document.createElement('input'); i.type = 'checkbox'; i.value = v; i.checked = !out.has(v);
          const s = document.createElement('span'); s.className = 'dash-check-label'; s.textContent = label(v);
          const c = document.createElement('span'); c.className = 'dash-count';
          l.append(i, s, c);
          return l;
        }));
        if (!values.length) { const p = document.createElement('p'); p.className = 't-small dash-menu-empty'; p.textContent = 'Nothing yet.'; list.appendChild(p); }
      }
      if (counts) for (const l of list.querySelectorAll('.dash-check')) l.lastElementChild.textContent = n(counts.get(l.firstElementChild.value) || 0);
      relabel();
    }
    function tick(on) {
      for (const i of list.querySelectorAll('input')) { i.checked = on; if (on) out.delete(i.value); else out.add(i.value); }
      if (on) out.clear();
      remember(); relabel(); onChange();
    }
    list.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) out.delete(e.target.value); else out.add(e.target.value);
      remember(); relabel(); onChange();
    });
    btn.addEventListener('click', () => show(!open()));
    allBtn.addEventListener('click', () => tick(true));
    noneBtn.addEventListener('click', () => tick(false));
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open()) { show(false); btn.focus(); } });
    wrap.addEventListener('focusout', (e) => { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) show(false); });   // tabbed away; a click on the card's own padding keeps it
    document.addEventListener('pointerdown', (e) => { if (open() && !wrap.contains(e.target)) show(false); });
    window.addEventListener('resize', () => { if (open()) place(); });
    relabel();
    // `out` is read on every match; `clear` is what Clear filters presses.
    return { out, set, focus: () => btn.focus(), clear: () => { for (const i of list.querySelectorAll('input')) i.checked = true; out.clear(); remember(); relabel(); }, keeps: (vs) => vs.some((v) => !out.has(v)) };
  }

  // ---- Session filters ----
  // The same menus as the feed's, over the sessions table, and the same seven
  // columns. A session holds several pages, can meet several gates, is made of
  // several kinds of event and can be reached by more than one source, so those
  // filters keep it while any one of its values is ticked; length uses the
  // histogram's bands. Places, pages, sources and devices list whatever the
  // period's sessions hold, commonest first, and the kind, gate and length
  // lists are fixed. Independent of the feed's filters, and remembered
  // nowhere: a reload starts with everything ticked.
  const band = (s) => s.length == null ? 'untimed' : BANDS.find(([, lo, hi]) => s.length / 1000 >= lo && s.length / 1000 < hi)[0];
  const SFACET = {            // every value the session has for that column
    kind:   (s) => [...s.kinds],
    where:  (s) => [s.where || 'unknown'],
    page:   (s) => [...new Set(s.views.map((v) => pageName(v.page)))],
    tried:  (s) => triedValues(s.tried),
    length: (s) => [band(s)],
    // Every source the session came by. The first event carries where they
    // arrived from and the rest are the site itself, so a session that went on
    // to a second page holds On the site as well as Greenhouse or Slack.
    ref:    (s) => [...s.refs],
    device: (s) => [s.device || 'unknown'],
  };
  const SOPTIONS = {          // the fixed lists, in a telling order
    tried:  ['any', 'gated', 'wrong password', 'unlocked', 'none'],
    length: BANDS.map(([label]) => label).concat('untimed'),
  };
  const SLABEL = { any: 'Met a gate', none: 'No gate', gated: 'At the gate', 'wrong password': 'Wrong password', unlocked: 'Unlocked', untimed: 'No time beacon' };
  const smenus = {};
  for (const wrap of document.querySelectorAll('#session-filters .dash-filter-multi')) {
    const k = wrap.dataset.filter;
    smenus[k] = multiFilter(wrap, {
      label: (v) => (k === 'kind' ? KIND[v] : SLABEL[v]) || v,
      onChange: () => renderSessions(sessions, Date.now()),
    });
  }
  const snarrowed = () => Object.values(smenus).some((m) => m.out.size);
  const sfiltering = () => !!followed || snarrowed();
  const smatches = (s) => (!followed || s.visitor === followed) && Object.keys(smenus).every((k) => smenus[k].keeps(SFACET[k](s)));
  function renderSessionFilters(all) {
    for (const k in smenus) {
      const counts = new Map(tally(all.flatMap(SFACET[k]), (v) => v));
      smenus[k].set(k === 'kind' ? Object.keys(KIND) : SOPTIONS[k] ? [...SOPTIONS[k]] : [...counts.keys()], counts);
    }
  }
  $('session-clear').addEventListener('click', () => {
    for (const k in smenus) smenus[k].clear();
    follow('');                                    // redraws both tables, whether or not anyone was followed
    smenus[Object.keys(smenus)[0]].focus();
  });

  function renderSessions(all, now) {
    renderSessionFilters(all);
    const sessions = all.filter(smatches);
    const tb = $('sessions');
    tb.replaceChildren(...sessions.slice(0, 40).map((s) => {
      const tr = document.createElement('tr');
      if (s.live) tr.dataset.live = '1';
      const route = s.views.map((v) => pageName(v.page)).filter((name, i, a) => name !== a[i - 1]);   // a reload is not a second page
      const cells = [
        ['time', ago(s.start, now), stamp(s.start)],
        ['where', s.where || 'unknown', '', 'Where'],
        ['route', route.join(' → '), route.length > 3 ? route.join(' → ') : '', 'Pages'],
        ['tried', '', '', 'Tried to open'],
        ['length', s.length == null ? '–' : dur(s.length), s.length == null ? 'No time beacon arrived for this visit' : '', 'Length'],
        ['device', s.device || '', '', 'Device'],
        ['visitor', s.visitor || '', '', 'Visitor'],
      ];
      for (const [cls, text, title, label] of cells) {
        const td = document.createElement('td');
        td.className = `c-${cls}`;
        if (label) td.dataset.label = label;
        if (cls === 'visitor') visitorCell(td, s.visitor); else td.textContent = text;
        if (title && title !== text) td.title = title;
        if (cls === 'time' && s.live) { const b = document.createElement('span'); b.className = 'dash-now'; b.textContent = 'Now'; td.appendChild(b); }
        if (cls === 'tried') fillTried(td, s.tried);
        tr.appendChild(td);
      }
      return tr;
    }));
    const on = sfiltering();
    if (on) $('session-count').textContent = `${n(sessions.length)} of ${n(all.length)} ${sessions.length === 1 ? 'matches' : 'match'}${sessions.length > 40 ? ' · newest 40 shown' : ''}`;
    $('session-state').hidden = !on;
    $('sessions-empty').textContent = followed && all.length && !snarrowed() ? 'This visitor has no session in the period.' : on ? 'No sessions match these filters.' : 'No sessions yet.';
    $('sessions-empty').hidden = sessions.length > 0;
  }

  // The line under the switch: what it is holding back, in plain numbers, so the
  // drop between the filtered dashboard and the all-time count is never a mystery.
  function renderReal() {
    const all = events.filter(isVisit);
    const hidden = all.length - all.filter(isReal).length;
    const why = realOnly && minSecs ? 'nothing ran the page, or nobody stayed that long'
      : realOnly ? 'nothing in them ran the page: a scanner or a crawler, not a reader'
        : 'nobody stayed that long';
    $('real-note').textContent = !realOnly && !minSecs
      ? 'Everything recorded is counted, scanners and crawlers included.'
      : hidden
        ? `${n(hidden)} of ${n(all.length)} kept visits hidden — ${why}. Views all time still counts them.`
        : 'Nothing hidden: everything kept looks like a person.';
  }

  // ---- Everything the period scopes, and the strip above it ----
  let sessions = [];
  function renderStats(now) {
    const today = startOfDay(now);
    const beacons = events.filter((e) => e.kind === 'time');
    // Readings first, then the sessions they decide: every visit event comes out
    // of buildSessions knowing its own, so what a scanner left can be told apart
    // from what a person did and dropped here, in the feed and on the map alike.
    timeOnPages(events.filter((e) => e.kind === 'viewed'), beacons);
    const everyone = buildSessions(events, now);
    const visits = events.filter((e) => isVisit(e) && isReal(e));
    const views = visits.filter((e) => e.kind === 'viewed');
    const all = realOnly ? everyone.filter((s) => s.human) : everyone;
    const here = all.filter((s) => s.live);
    renderReal();
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
    renderList('refs', tally(inRange, (e) => refName(e.ref)), 8, blockButton);
    renderList('devices', tally(inRange, (e) => e.device || 'unknown'));
    renderMap(inRange, now);
    chart.update(buckets(inRange, now));
    sessions = all.filter((s) => s.start >= start);
    renderHist(sessions);
    renderSessions(sessions, now);

    const latest = views[0];
    const reading = here.map((s) => s.views.length ? pageName(s.views[s.views.length - 1].page) : 'a password gate');
    $('summary').textContent = here.length
      ? `${here.length === 1 ? 'One person is' : `${n(here.length)} people are`} on the site right now, reading ${[...new Set(reading)].slice(0, 3).join(', ')} · ${n(todaysViews.length)} view${todaysViews.length === 1 ? '' : 's'} today`
      : latest
        ? `Nobody right now · Last visit ${ago(latest.t, now)} from ${latest.where || 'somewhere unknown'} · ${n(todaysViews.length)} view${todaysViews.length === 1 ? '' : 's'} today`
        : 'No visits recorded yet. They will appear here as people arrive.';
  }

  // ---- Blocking referrer spam ----
  // A Block button beside each external host in Sent by. Pressing it once
  // arms it with what it will drop; pressing it again asks the edge to add the
  // host to the blocklist and remove that host's views from the log (for good:
  // unblocking only lets new ones in). The blocked hosts sit under the list
  // with an Unblock each. What is blocked is hidden here at once; the edge
  // stops recording it within a minute.
  let armed = '';
  const status = $('refs-status');
  const isHost = (label) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(label);
  const viewsFrom = (host) => events.filter((e) => isVisit(e) && (refHost(e.ref) === host || refHost(e.ref).endsWith(`.${host}`))).length;
  function blockButton(label) {
    if (!isHost(label)) return null;                 // Direct and On the site can't be blocked
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dash-act'; b.dataset.host = label;
    b.setAttribute('aria-label', `Block ${label}`);
    setArmed(b, label === armed);
    return b;
  }
  function setArmed(b, on) {
    const host = b.dataset.host;
    b.classList.toggle('is-armed', on);
    if (on) {
      const k = viewsFrom(host), views = `${n(k)} view${k === 1 ? '' : 's'}`;
      b.textContent = 'Sure?';
      b.setAttribute('aria-label', `Block ${host} and drop its ${views}: press again to confirm`);
      status.textContent = `Blocking ${host} drops its ${views} from the log for good. Press again to confirm.`;
    } else {
      b.textContent = 'Block'; b.setAttribute('aria-label', `Block ${host}`);
      if (status.textContent.startsWith('Blocking ') && status.textContent.endsWith('confirm.')) status.textContent = '';
    }
  }
  function disarm() {
    if (!armed) return;
    const b = $('refs').querySelector(`[data-host="${CSS.escape(armed)}"]`);
    armed = '';
    if (b) setArmed(b, false);
  }
  async function setBlocked(host, block) {
    status.textContent = block ? `Blocking ${host}…` : `Unblocking ${host}…`;
    try {
      const res = await fetch('/api/activity', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, block }) });
      if (res.status === 401) { location.reload(); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      blocked = data.blocked;
      if (block) { events = events.filter((e) => !isSpam(e)); total = Math.max(0, total - data.removed); }
      status.textContent = block
        ? `Blocked ${host} · ${n(data.removed)} view${data.removed === 1 ? '' : 's'} dropped`
        : `Unblocked ${host} · new views from it count again`;
      forceLists = true;
      try { renderStats(Date.now()); refilter(); renderBlocked(); } finally { forceLists = false; }
      // Focus follows the host: to its Unblock, or back to the lists once it is gone.
      const next = block ? $('blocked-list').querySelector(`[data-host="${CSS.escape(host)}"]`) : ($('blocked-list').querySelector('.dash-act') || $('refs').querySelector('.dash-act'));
      (next || status).focus();
    } catch (err) {
      console.error(err);
      status.textContent = `Couldn't ${block ? 'block' : 'unblock'} ${host}: ${err.message}`;
    }
  }
  $('refs').addEventListener('click', (e) => {
    const b = e.target.closest('.dash-act');
    if (!b) return;
    const host = b.dataset.host;
    if (armed === host) { armed = ''; setArmed(b, false); setBlocked(host, true); return; }
    disarm();
    armed = host;
    setArmed(b, true);
  });
  $('refs').addEventListener('keydown', (e) => { if (e.key === 'Escape' && armed) { disarm(); } });
  $('refs').addEventListener('focusout', (e) => { if (armed && !$('refs').contains(e.relatedTarget)) disarm(); });
  let listedBlocked = '';
  function renderBlocked() {
    const box = $('refs-blocked'), ul = $('blocked-list');
    const sig = blocked.join('\n');
    if (sig === listedBlocked || (!forceLists && ul.contains(document.activeElement))) return;
    listedBlocked = sig;
    ul.replaceChildren(...blocked.map((host) => {
      const li = document.createElement('li');
      const s = document.createElement('span'); s.textContent = host;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dash-act'; b.dataset.host = host; b.textContent = 'Unblock'; b.setAttribute('aria-label', `Unblock ${host}`);
      b.addEventListener('click', () => setBlocked(host, false));
      li.append(s, b);
      return li;
    }));
    box.hidden = !blocked.length;
  }

  // ---- Feed filters ----
  // A menu each, filled with whatever the feed has seen, commonest first, so a
  // list is never longer than the site's traffic; the kind and gate lists are
  // fixed, the gate one shared with the sessions table (SOPTIONS). The places
  // menu is the one whose ticks are remembered in this browser (data-remember
  // in the markup), which is how the owner's own city stays out of the feed for
  // good; every other menu starts with everything ticked on a fresh load.
  const FACET = {
    kind:   (e) => [e.kind],
    page:   (e) => [pageName(e.page)],
    // A visit shows its whole session's gates, so it matches on any of them.
    tried:  (e) => triedValues(e.session && e.session.tried),
    where:  (e) => [e.where || 'unknown'],
    ref:    (e) => [refName(e.ref)],
    device: (e) => [e.device || 'unknown'],
  };
  const menus = {};
  for (const wrap of document.querySelectorAll('#feed-filters .dash-filter-multi')) {
    const k = wrap.dataset.filter;
    menus[k] = multiFilter(wrap, {
      label: (v) => (k === 'kind' ? KIND[v] : SLABEL[v]) || v,
      onChange: () => refilter(),
    });
  }
  const filtering = () => !!followed || Object.values(menus).some((m) => m.out.size);
  const matches = (e) => (!followed || e.visitor === followed) && Object.keys(menus).every((k) => menus[k].keeps(FACET[k](e)));
  function renderFilters(visits) {
    for (const k in menus) {
      const counts = new Map(tally(visits.flatMap(FACET[k]), (v) => v));
      menus[k].set(k === 'kind' ? Object.keys(KIND) : SOPTIONS[k] ? [...SOPTIONS[k]] : [...counts.keys()], counts);
    }
  }
  function refilter() {
    $('feed').replaceChildren();
    rows.clear();
    renderFeed([]);
  }
  $('feed-clear').addEventListener('click', () => {
    for (const k in menus) menus[k].clear();
    if (followed) follow(''); else refilter();
    menus[Object.keys(menus)[0]].focus();
  });

  // ---- The feed ----
  const rows = new Map();     // event key → its row, so a time reading can land on it later
  let triedShown = '';        // the gates the drawn rows were filtered on (see renderFeed)
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
      ['tried', '', '', 'Tried to open'],
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
      if (cls === 'kind') { const b = document.createElement('span'); b.className = 'dash-kind'; b.dataset.kind = e.kind; b.textContent = text; td.appendChild(b); }
      else if (cls === 'tried') fillTried(td, e.session ? e.session.tried : new Map());   // what that visit tried, on each of its rows
      else if (cls === 'visitor') visitorCell(td, e.visitor);
      else td.textContent = text;
      if (title && title !== text) td.title = title;
      tr.appendChild(td);
    }
    rows.set(tr.dataset.key, tr);
    return tr;
  }

  function renderFeed(fresh) {
    const tb = $('feed');
    const visits = events.filter((e) => isVisit(e) && isReal(e));
    const shown = (e) => isVisit(e) && isReal(e) && matches(e);
    // A visit's gates fill in over the following polls, so which rows the gate
    // filter keeps can change under it: redraw the feed when they do.
    const onTried = menus.tried.out.size > 0;
    const sig = onTried ? visits.map((e) => (e.session ? triedSig(e.session.tried) : '')).join('|') : '';
    if (sig !== triedShown) { triedShown = sig; if (onTried) { tb.replaceChildren(); rows.clear(); } }
    // Which rows are a person's moves under the feed too, both ways: a session
    // runs out its grace with no beacon and its rows go, or a reading arrives
    // late and earns them back. Drop what no longer belongs, and start over when
    // something that does has no row of its own.
    const belongs = new Set(visits.filter(matches).map(key));
    for (const tr of [...tb.children]) if (!belongs.has(tr.dataset.key)) { rows.delete(tr.dataset.key); tr.remove(); }
    if (tb.children.length) {
      const arriving = new Set(fresh.map(key));
      const want = visits.filter(matches).slice(0, 200);
      if (want.some((e) => !rows.has(key(e)) && !arriving.has(key(e)))) { tb.replaceChildren(); rows.clear(); }
    }
    if (!tb.children.length) {                       // first paint, or a new filter: everything at once
      tb.replaceChildren(...visits.filter(matches).slice(0, 200).map((e) => row(e, false)));
    } else {
      for (const e of [...fresh].reverse()) if (shown(e)) tb.prepend(row(e, true));   // newest ends up on top
      while (tb.children.length > 200) { rows.delete(tb.lastElementChild.dataset.key); tb.lastElementChild.remove(); }
    }
    for (const e of events) {                        // readings and gate outcomes that arrived since the row was drawn
      if (!isVisit(e)) continue;
      const tr = rows.get(key(e));
      if (!tr) continue;
      if (e.session) fillTried(tr.querySelector('.c-tried'), e.session.tried);
      if (e.kind !== 'viewed' || e.secs == null) continue;
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

  // ---- The real-visits switch ----
  // Both controls are read-time: the log is untouched and the switch puts
  // everything back. Each choice is remembered in this browser, the way the
  // place ticks are. Flipping either redraws from the top — what the feed shows
  // changes wholesale, so the incremental path has nothing to work from.
  const realBtn = $('real-only'), secsSel = $('real-secs');
  secsSel.value = String(minSecs);
  function syncReal() {
    realBtn.setAttribute('aria-pressed', String(realOnly));
    realBtn.parentElement.classList.toggle('is-on', realOnly);
    secsSel.parentElement.classList.toggle('is-on', minSecs > 0);
  }
  function redrawAll() {
    $('feed').replaceChildren();
    rows.clear();
    triedShown = null;
    fitted = false;                                  // the map settles on whatever is left
    syncReal();
    if (events.length) { renderStats(Date.now()); renderFeed([]); } else renderReal();
  }
  realBtn.addEventListener('click', () => { realOnly = !realOnly; save(REAL_KEY, realOnly ? '1' : '0'); redrawAll(); });
  secsSel.addEventListener('change', () => { minSecs = Number(secsSel.value) || 0; save(SECS_KEY, String(minSecs)); redrawAll(); });
  syncReal();
  if ('ResizeObserver' in window) {                  // the histogram is drawn in pixels too
    let w = $('hist').clientWidth;
    new ResizeObserver(() => { if ($('hist').clientWidth !== w) { w = $('hist').clientWidth; if (events.length) renderHist(sessions); } }).observe($('hist'));
  }
  // The feeds are wider than a narrow window and scroll sideways, so each frame is a
  // tab stop while it overflows, named for the reader who lands on it, and not
  // otherwise (main.js does the same for the case-study tables). Watched as the frame
  // or its table changes size: a details opening, rows filling in, the window.
  if ('ResizeObserver' in window) {
    document.querySelectorAll('.table-wrap').forEach((w) => {
      const ro = new ResizeObserver(() => {
        if (w.scrollWidth > w.clientWidth + 1) { w.tabIndex = 0; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Table, scroll sideways'); }
        else { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
      });
      ro.observe(w);
      ro.observe(w.querySelector('table'));
    });
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
      blocked = data.blocked || [];
      const fresh = data.events.filter((e) => !seen.has(key(e)) && !isSpam(e));   // spam the edge recorded before its blocklist caught up
      for (const e of data.events) seen.add(key(e));
      if (fresh.length) events = fresh.concat(events).sort((a, b) => b.t - a.t).slice(0, KEEP);
      if (data.events.length) lastT = Math.max(lastT, data.events[0].t);
      total = data.total;
      lastOk = Date.now();
      renderStats(Date.now());
      renderFeed(fresh);
      renderBlocked();
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
