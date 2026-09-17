#!/usr/bin/env node
// Local stand-in for Vercel's edge: serves the static files through
// middleware.js with an in-memory Redis and made-up geolocation, so the gates
// and the activity dashboard can be exercised without deploying.
//
//   node dev.mjs            → http://127.0.0.1:4174
//   password for /work:     cs        dashboard: admin
//
// Each browser is given a made-up city and address in a cookie on its first
// request, so its views and time-on-page beacons pair up as they would live;
// open pages in a private window (the dashboard's own browser is muted) to
// see the dashboard move. SEED=0 skips the sample history.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

process.env.CASE_STUDY_PASSWORD ||= 'cs';
process.env.ADMIN_PASSWORD ||= 'admin';
process.env.KV_REST_API_URL = 'http://store.local';
process.env.KV_REST_API_TOKEN = 'local';

// ---- In-memory Redis behind the REST shape middleware.js speaks ----
const lists = new Map(), values = new Map();
const cmd = ([op, key, ...args]) => {
  switch (op) {
    case 'LPUSH': { const l = lists.get(key) || []; l.unshift(...args); lists.set(key, l); return l.length; }
    case 'LTRIM': { const l = lists.get(key) || []; lists.set(key, l.slice(Number(args[0]), Number(args[1]) + 1)); return 'OK'; }
    case 'LRANGE': { const l = lists.get(key) || []; const end = Number(args[1]); return l.slice(Number(args[0]), end < 0 ? undefined : end + 1); }
    case 'INCR': { const v = (Number(values.get(key)) || 0) + 1; values.set(key, String(v)); return v; }
    case 'GET': return values.get(key) ?? null;
    default: throw new Error(`unsupported ${op}`);
  }
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(process.env.KV_REST_API_URL)) {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify(body.map((c) => { try { return { result: cmd(c) }; } catch (e) { return { error: e.message }; } })), { headers: { 'Content-Type': 'application/json' } });
  }
  if (String(url).startsWith('https://api.resend.com')) return new Response('{}', { status: 200 });
  return realFetch(url, init);
};

// ---- Sample history so the tallies have something to show ----
// Sixty-odd sessions over the last week: a visitor reads one to four pages,
// each for a while, with a time beacon every minute and one as they leave.
const PLACES = [
  ['New York', 'NY', 'US', 40.713, -74.006], ['Brooklyn', 'NY', 'US', 40.678, -73.944], ['San Francisco', 'CA', 'US', 37.775, -122.419],
  ['Austin', 'TX', 'US', 30.267, -97.743], ['Chicago', 'IL', 'US', 41.878, -87.630], ['London', 'ENG', 'GB', 51.507, -0.128],
  ['Toronto', 'ON', 'CA', 43.653, -79.383], ['Berlin', 'BE', 'DE', 52.520, 13.405], ['Lisbon', '11', 'PT', 38.722, -9.139], ['Sydney', 'NSW', 'AU', -33.869, 151.209],
];
const PAGES = ['/', '/', '/', '/work.html', '/work.html', '/work/staking.html', '/work/cross-sell.html', '/work/verifications.html', '/work/refinance-offers.html', '/work/no-code-tools.html', '/work/design-system-audit-agent.html'];
const REFS = ['direct', 'direct', 'https://www.linkedin.com/', 'https://www.linkedin.com/feed/', 'https://www.google.com/', 'https://mail.google.com/mail/u/0/'];
const DEVICES = ['Chrome on macOS', 'Safari on iOS', 'Safari on macOS', 'Chrome on Windows', 'Firefox on macOS', 'Chrome on Android'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
if (process.env.SEED !== '0') {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < 70; i++) {
    const p = pick(PLACES), device = pick(DEVICES), visitor = Math.random().toString(16).slice(2, 8);
    const where = p.slice(0, 3).join(', ');
    let t = now - Math.floor(Math.random() ** 1.6 * 7 * 86400000);
    const pages = 1 + Math.floor(Math.random() ** 2 * 4);
    let ref = pick(REFS);
    for (let k = 0; k < pages && t < now; k++) {
      const page = k === 0 ? pick(['/', '/', '/work.html']) : pick(PAGES);
      const base = { page, where, country: p[2], lat: p[3], lon: p[4], device, visitor };
      if (page.startsWith('/work/') && Math.random() < .4) {                                                     // met the gate: most get in, some mistype, some leave
        rows.push({ t, kind: 'gated', ref, ...base });
        const r = Math.random();
        if (r < .5) rows.push({ t: t + 1000, kind: 'wrong password', ref, ...base });
        if (r < .25 || (r >= .5 && r < .65)) { t += 2000 + Math.random() * 6000; ref = page; continue; }   // gave up, at the gate or after a wrong password
        rows.push({ t: t + 2000, kind: 'unlocked', ref, ...base });
      }
      rows.push({ t, kind: 'viewed', ref, ...base });
      const stay = Math.random() < .2 ? 3000 + Math.random() * 12000 : 20000 + Math.random() ** 2 * 420000;   // a bounce, or up to seven minutes
      if (Math.random() < .85) {                                                                          // most visits have their beacons; a few were lost
        for (let s = 60000; s < stay; s += 60000) rows.push({ t: t + s, kind: 'time', page, secs: Math.round(s / 1000), visitor });
        rows.push({ t: t + stay, kind: 'time', page, secs: Math.round(stay / 1000), visitor });
      }
      t += stay + 1000 + Math.random() * 4000;
      ref = page;
    }
  }
  rows.sort((a, b) => b.t - a.t);
  lists.set('activity', rows.filter((r) => r.t <= now).map((r) => JSON.stringify(r)));
  values.set('activity:count', String(rows.filter((r) => r.kind === 'viewed').length + 1840));
}

// ---- A browser keeps one made-up identity ----
const identities = new Map();   // dev_id cookie → { place, ip }
function identify(req) {
  const m = /(?:^|;\s*)dev_id=([a-z0-9]+)/.exec(req.headers.cookie || '');
  let id = m && m[1], fresh = false;
  if (!id || !identities.has(id)) {
    id = Math.random().toString(36).slice(2, 10);
    identities.set(id, { place: pick(PLACES), ip: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` });
    fresh = true;
  }
  return { id, fresh, ...identities.get(id) };
}

// ---- Serve through the middleware ----
const { default: middleware, config } = await import('./middleware.js');
const matchers = config.matcher.map((m) => new RegExp('^' + m.replace(/[.]/g, '\\.').replace(/\/:path\*$/, '(?:/.*)?') + '$'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.json': 'application/json' };
const root = path.dirname(new URL(import.meta.url).pathname);

function serveStatic(pathname, res, cookies = []) {
  let file = path.join(root, decodeURIComponent(pathname));
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(cookies.length ? { 'set-cookie': cookies } : {}) });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const matched = matchers.some((m) => m.test(url.pathname));
  if (!matched) return serveStatic(url.pathname, res);

  const who = identify(req), p = who.place;
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
  h.set('x-vercel-ip-city', encodeURIComponent(p[0])); h.set('x-vercel-ip-country-region', p[1]); h.set('x-vercel-ip-country', p[2]);
  h.set('x-vercel-ip-latitude', String(p[3])); h.set('x-vercel-ip-longitude', String(p[4]));
  h.set('x-forwarded-for', who.ip);
  const body = req.method === 'POST' ? await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }) : undefined;
  const request = new Request(url, { method: req.method, headers: h, body });
  const jobs = [];
  const out = await middleware(request, { waitUntil: (pr) => jobs.push(pr) });
  await Promise.all(jobs);
  const identity = who.fresh ? [`dev_id=${who.id}; Path=/; Max-Age=31536000; SameSite=Lax`] : [];
  if (!out) return serveStatic(url.pathname, res, identity);

  const headers = {};
  for (const [k, v] of out.headers) if (k !== 'set-cookie') headers[k] = v;
  const cookies = (out.headers.getSetCookie ? out.headers.getSetCookie() : []).map((c) => c.replace('; Secure', ''));   // plain http locally
  if (cookies.length || identity.length) headers['set-cookie'] = cookies.concat(identity);
  res.writeHead(out.status, headers);
  res.end(Buffer.from(await out.arrayBuffer()));
});

const port = Number(process.env.PORT) || 4174;
server.listen(port, '127.0.0.1', () => console.log(`edge stand-in on http://127.0.0.1:${port}  (work: ${process.env.CASE_STUDY_PASSWORD} · dashboard: ${process.env.ADMIN_PASSWORD})`));
