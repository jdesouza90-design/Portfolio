/* The activity dashboard (admin/index.html): polls /api/activity every few
   seconds, tallies the last seven days, places every visit on the map and
   keeps the live feed newest-first. Sized and coloured by the same tokens as
   the site (styles.css, section 12). */
(() => {
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 3000;
  const DAY = 86400000, WEEK = 7 * DAY;
  const NAMES = {
    '/': 'Home', '/index.html': 'Home', '/work.html': 'Work',
    '/work/cross-sell.html': 'Cross-Sell', '/work/verifications.html': 'Verifications',
    '/work/refinance-offers.html': 'Refinance offers', '/work/staking.html': 'Staking',
    '/work/no-code-tools.html': 'No-code tools', '/work/sign-in-with-ethereum.html': 'Sign-in with Ethereum',
  };
  const pageName = (p) => NAMES[p] || p.replace(/^\/work\//, '').replace(/\.html$/, '') || p;
  const refName = (r) => {
    if (!r || r === 'direct') return 'Direct';
    if (r.startsWith('/')) return 'On the site';
    try { return new URL(r).hostname.replace(/^www\./, ''); } catch (_) { return r; }
  };
  const KIND = { viewed: 'View', unlocked: 'Unlocked', 'wrong password': 'Wrong password' };

  let events = [];            // newest first
  let total = 0;
  let lastT = 0;
  let timer = null;
  let lastOk = 0;
  const seen = new Set();
  const live = $('live'), liveLabel = $('live-label');

  const setLive = (state, label) => { live.dataset.state = state; liveLabel.textContent = label; };
  const n = (x) => x.toLocaleString('en-US');
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

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

  function tally(list, key) {
    const m = new Map();
    for (const e of list) { const k = key(e); m.set(k, (m.get(k) || 0) + 1); }
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
    map.setView([30, 0], 2);
    dots = L.layerGroup().addTo(map);
    $('map-fit').addEventListener('click', () => fitAll(true));
    return map;
  }
  function fitAll(animate) {
    if (!map || !dots) return;
    const pts = dots.getLayers().map((d) => d.getLatLng());
    if (!pts.length) { map.setView([30, 0], 2, { animate }); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 10, animate });
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
      const radius = Math.min(22, 6 + 3 * Math.sqrt(p.n));
      const fresh = p === newest && now - p.last < 3600000;
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

  function renderStats(now) {
    const today = startOfToday();
    const todays = events.filter((e) => e.t >= today);
    const views = todays.filter((e) => e.kind === 'viewed');
    $('s-views').textContent = n(views.length);
    $('s-visitors').textContent = n(new Set(views.map((e) => e.visitor)).size);
    $('s-unlocks').textContent = n(todays.filter((e) => e.kind === 'unlocked').length);
    $('s-total').textContent = n(total);

    const week = events.filter((e) => e.t >= now - WEEK && e.kind === 'viewed');
    renderList('where', tally(week, (e) => e.where || 'unknown'));
    renderList('pages', tally(week, (e) => pageName(e.page)));
    renderList('refs', tally(week, (e) => refName(e.ref)));
    renderMap(week, now);

    const latest = events[0];
    $('summary').textContent = latest
      ? `Last visit ${ago(latest.t, now)} from ${latest.where || 'somewhere unknown'} · ${n(views.length)} view${views.length === 1 ? '' : 's'} today`
      : 'No visits recorded yet. They will appear here as people arrive.';
  }

  function row(e, fresh) {
    const tr = document.createElement('tr');
    tr.dataset.t = e.t;
    if (fresh) tr.className = 'is-new';
    tr.dataset.kind = e.kind;
    const cells = [
      ['time', ago(e.t, Date.now()), stamp(e.t)],
      ['kind', KIND[e.kind] || e.kind],
      ['page', pageName(e.page), e.page],
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
    return tr;
  }

  function renderFeed(fresh) {
    const tb = $('feed');
    if (!tb.children.length) {                       // first paint: everything at once
      tb.replaceChildren(...events.slice(0, 200).map((e) => row(e, false)));
    } else {
      for (const e of [...fresh].reverse()) tb.prepend(row(e, true));   // newest ends up on top
      while (tb.children.length > 200) tb.lastElementChild.remove();
    }
    $('feed-empty').hidden = tb.children.length > 0;
  }

  function tickClock() {                             // relative times drift; refresh the words
    const now = Date.now();
    for (const tr of $('feed').children) tr.firstElementChild.textContent = ago(Number(tr.dataset.t), now);
    if (events[0]) renderStats(now);
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
      const fresh = data.events.filter((e) => !seen.has(`${e.t}|${e.visitor}|${e.page}`));
      for (const e of fresh) seen.add(`${e.t}|${e.visitor}|${e.page}`);
      if (fresh.length) {
        events = fresh.concat(events).sort((a, b) => b.t - a.t).slice(0, 2000);
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
