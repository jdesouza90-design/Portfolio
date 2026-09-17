// Vercel Edge Middleware — the two password gates and the activity log.
// Runs before the static files are served.
//
//   /work/*         the case-study password (CASE_STUDY_PASSWORD); the owner's
//                   admin cookie opens them too
//   /admin/*        the dashboard, the owner's password (ADMIN_PASSWORD)
//   /api/activity   the feed the dashboard polls, and the referrer blocklist it
//                   edits (POST); needs the admin cookie
//   /api/ping       the beacon main.js sends with the time a page has been read
//   everything else public, but every page view is recorded
//
// A correct case-study password sends the reader on with ?unlocked, which
// main.js answers with the opener (the sheet that parts) exactly once.
//
// Activity log: every page view on the site, every password gate reached, every
// case-study unlock and every wrong password is written to Vercel's runtime logs and, when an Upstash Redis
// store is connected (KV_REST_API_URL / KV_REST_API_TOKEN), kept there for the
// dashboard, along with the time-on-page beacons that give it session lengths.
// Case-study events are also emailed via Resend when RESEND_API_KEY and
// ACCESS_LOG_TO are set. Signing in to the dashboard, or opening any page once
// with ?owner, mutes logging for your own browser. Referrer spam is blocked
// from the dashboard: a host on the blocklist (activity:blocked, kept by the
// dashboard's Block buttons) has its views neither recorded nor counted.

export const config = { matcher: ['/', '/index.html', '/work.html', '/work/:path*', '/admin/:path*', '/api/activity', '/api/ping'] };

const COOKIE = 'cs_access';
const MAX_AGE = 60 * 60 * 24 * 30;          // 30 days
const ADMIN_COOKIE = 'admin_access';
const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;    // 30 days
const OWNER_COOKIE = 'cs_owner';
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;   // a year

const FEED_KEY = 'activity';                // Redis list, newest first
const COUNT_KEY = 'activity:count';         // all-time page views
const FEED_KEEP = 4000;                     // entries kept in the list (views and time beacons), all sent on the dashboard's first load
const FEED_POLL = 100;                      // entries a poll reads before deciding whether it needs to go further back
const PING_MAX = 4 * 3600;                  // seconds on one page a beacon may claim
const BLOCK_KEY = 'activity:blocked';       // Redis set of referrer hosts whose views are spam
const BLOCK_TTL = 60000;                    // ms an edge instance keeps its copy of the set before reading it again

async function sha256(s) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const tokenFor = (password) => sha256(`cs-gate:v1:${password}`);
const adminTokenFor = (password) => sha256(`admin-gate:v1:${password}`);

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
const setCookie = (name, value, path, maxAge) => `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

// The two gates share one page; `admin` swaps the copy.
function page({ path, error, unconfigured, ref, admin }) {
  const msg = unconfigured
    ? `<p class="gate-error t-small" id="gate-error" role="alert">${admin ? 'The dashboard password isn\'t configured yet. Set ADMIN_PASSWORD' : 'The case-study password isn\'t configured yet. Set CASE_STUDY_PASSWORD'} in the Vercel project and redeploy.</p>`
    : error
      ? '<p class="gate-error t-small" id="gate-error" role="alert">That password didn\'t match. Check for extra spaces and try again.</p>'
      : '';
  const describe = msg ? ' aria-describedby="gate-error"' : '';
  // The owner's gate says only "Sign in": what lies behind it is nobody else's business.
  const eyebrow = admin ? '' : '<p class="eyebrow">Case studies</p>';
  const title = admin ? 'Sign in' : 'This case study is password protected.';
  const body = admin
    ? ''
    : '<p class="t-body">Enter the password I shared with you. Don\'t have it yet? <a href="https://www.linkedin.com/in/johndesouza-/" target="_blank" rel="noopener">Message me on LinkedIn</a> and I\'ll send it over.</p>';
  const button = admin ? 'Sign in' : 'Open case study';
  const back = admin ? '<a class="back" href="/">← Back to the site</a>' : '<a class="back" href="/work.html">← Back to all work</a>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${admin ? 'Sign in' : 'Password required'} — John DeSouza</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg?v=fb53733d" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=cc467d8d">
</head>
<body>
<main class="gate-wrap"><div class="gate">
  <a class="brand" href="/"><span>John DeSouza</span></a>
  ${eyebrow}
  <h1 class="t-title">${title}</h1>
  ${body}
  <form method="post" action="${esc(path)}" class="gate-form">
    <label class="sr-only" for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Password"${error ? ' aria-invalid="true"' : ''}${describe}>${msg}${ref ? `
    <input type="hidden" name="ref" value="${esc(ref)}">` : ''}
    <button class="btn btn-primary" type="submit">${button}</button>
  </form>
  ${back}
</div></main>
</body>
</html>`;
}


// ---- Store ------------------------------------------------------------------
// Upstash Redis over its REST API (what Vercel's Storage tab provisions), so
// nothing needs bundling. Either env naming works.

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

// Runs a pipeline of commands; resolves to their results, or null when no store is connected.
async function redis(commands) {
  const s = store();
  if (!s) return null;
  const res = await fetch(`${s.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`store ${res.status}: ${await res.text()}`);
  const out = await res.json();
  for (const r of out) if (r.error) throw new Error(`store: ${r.error}`);
  return out.map((r) => r.result);
}


// ---- Activity log -----------------------------------------------------------

// Referrer with its query string dropped (LinkedIn et al. append tracking params).
// Same-host referrers come back as a bare path, external ones as origin + path.
function refOf(request, url) {
  try {
    const r = new URL(request.headers.get('referer') || '');
    return r.host === url.host ? r.pathname : r.origin + r.pathname;
  } catch (_) { return ''; }
}
const isExternal = (ref) => /^https?:/.test(ref);
// The host a referrer names, the way the dashboard shows it (no www.); '' for direct and same-site.
function hostOf(ref) {
  if (!isExternal(ref)) return '';
  try { return new URL(ref).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return ''; }
}
// A blocked host covers its subdomains too: referrer spam rotates them.
const hostBlocked = (host, blocked) => !!host && blocked.some((b) => host === b || host.endsWith(`.${b}`));

// The blocklist as this edge instance last read it. A block takes effect here
// within a minute; the dashboard hides the host's views at once regardless.
let blockedAt = 0, blockedHosts = [];
async function blocklist() {
  if (Date.now() - blockedAt > BLOCK_TTL) {
    try {
      const [hosts] = (await redis([['SMEMBERS', BLOCK_KEY]])) || [[]];
      blockedHosts = hosts || [];
      blockedAt = Date.now();
    } catch (err) { console.error('access-log: blocklist failed', err); }   // the last copy serves until the store answers
  }
  return blockedHosts;
}

// Coarse device/browser read of the user agent; the raw string is logged alongside.
function describeUA(ua) {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown browser';
  return `${browser} on ${os}`;
}

// Crawlers and link previewers; their fetches aren't visits.
const isBot = (ua) => !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|slack|embedly|quora|pinterest|vkshare|headless|lighthouse|pingdom|uptime/i.test(ua);
// Speculative loads (link prefetch, prerender) that nobody has looked at.
const isPrefetch = (h) => /prefetch|prerender/i.test(h.get('purpose') || h.get('sec-purpose') || h.get('x-purpose') || '');

// Vercel's IP geolocation headers (city is percent-encoded).
function whereFrom(h) {
  const dec = (v) => { try { return v && decodeURIComponent(v); } catch (_) { return v; } };
  return [dec(h.get('x-vercel-ip-city')), h.get('x-vercel-ip-country-region'), h.get('x-vercel-ip-country')]
    .filter(Boolean).join(', ') || 'unknown';
}
// The same lookup's coordinates, for the dashboard's map: city-level accuracy, three decimals.
function coordsOf(h) {
  const lat = parseFloat(h.get('x-vercel-ip-latitude')), lon = parseFloat(h.get('x-vercel-ip-longitude'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: +lat.toFixed(3), lon: +lon.toFixed(3) } : {};
}

// Short stable id per visitor so one person's sequence of views can be followed.
// Hashed with the gate token so the raw IP is never stored or sent.
async function visitorId(request, salt) {
  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0].trim();
  const ua = request.headers.get('user-agent') || '';
  return (await sha256(`${ip}|${ua}|${salt}`)).slice(0, 6);
}

function whenNow() {
  const tz = process.env.ACCESS_LOG_TZ || 'America/New_York';
  const now = new Date();
  try {
    return `${now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })} (${tz})`;
  } catch (_) { return now.toISOString(); }
}

async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY, to = process.env.ACCESS_LOG_TO;
  if (!key || !to) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ACCESS_LOG_FROM || 'Portfolio <onboarding@resend.dev>', to, subject, text }),
  });
  if (!res.ok) console.error('access-log: email failed', res.status, await res.text());
}

// kind: 'viewed' | 'gated' | 'unlocked' | 'wrong password'. Never throws — the pages must not break.
// Every event goes to the runtime log and the store; case-study events are emailed too,
// except reaching the gate, which the dashboard shows and which would otherwise double
// every unlock's mail.
async function logAccess(kind, request, url, salt, ref) {
  try {
    const ua = request.headers.get('user-agent') || '';
    const entry = {
      t: Date.now(),
      kind,
      page: url.pathname,
      where: whereFrom(request.headers),
      country: request.headers.get('x-vercel-ip-country') || '',
      ...coordsOf(request.headers),
      ref: ref || refOf(request, url) || 'direct',
      device: describeUA(ua),
      visitor: await visitorId(request, salt),
    };
    if (hostBlocked(hostOf(entry.ref), await blocklist())) return;   // referrer spam: not a visit
    console.log('access', JSON.stringify(entry));
    const jobs = [
      redis([
        ['LPUSH', FEED_KEY, JSON.stringify(entry)],
        ['LTRIM', FEED_KEY, 0, FEED_KEEP - 1],
        ['INCR', COUNT_KEY],
      ]).catch((err) => console.error('access-log: store failed', err)),
    ];
    if (url.pathname.startsWith('/work/') && kind !== 'gated') {
      const name = url.pathname.replace(/^\/work\//, '').replace(/\.html$/, '');
      jobs.push(sendEmail(
        `Case study ${kind}: ${name} · ${entry.where}`,
        [
          `Event:     ${kind}`,
          `Page:      ${url.pathname}`,
          `When:      ${whenNow()}`,
          `Where:     ${entry.where}`,
          `Referrer:  ${entry.ref}`,
          `Device:    ${entry.device}`,
          `Visitor:   ${entry.visitor}`,
          ``,
          `User agent: ${ua}`,
        ].join('\n'),
      ));
    }
    await Promise.all(jobs);
  } catch (err) {
    console.error('access-log: failed', err);
  }
}


// ---- Time on page -----------------------------------------------------------
// POST /api/ping {page, secs}: main.js sends one every minute while a page is
// being looked at and as it is left, carrying the seconds it has been in view.
// Kept in the same list as the views, never emailed; the dashboard pairs each
// with the visit it belongs to and reads session lengths from them.

async function ping(request, salt) {
  let page = '', secs = 0;
  try {
    const body = JSON.parse(await request.text());
    page = String(body.page || '').slice(0, 200);
    secs = Math.min(PING_MAX, Math.max(0, Math.round(Number(body.secs) || 0)));
  } catch (_) {}
  if (!/^\/[\w\-./]*$/.test(page)) return;
  const entry = { t: Date.now(), kind: 'time', page, secs, visitor: await visitorId(request, salt) };
  console.log('access', JSON.stringify(entry));
  await redis([['LPUSH', FEED_KEY, JSON.stringify(entry)], ['LTRIM', FEED_KEY, 0, FEED_KEEP - 1]])
    .catch((err) => console.error('access-log: ping failed', err));
}


// ---- The feed ---------------------------------------------------------------
// GET /api/activity?since=<ms>  →  { configured, now, total, events, blocked }
// `events` is newest first, only those after `since` when it is given. The
// first load takes everything kept; a poll reads a short window and only goes
// further back when every entry in it turned out to be new. `blocked` is the
// referrer blocklist, so the dashboard can hide and unblock.
//
// POST /api/activity {host, block}  →  { blocked, removed }
// Adds a referrer host to the blocklist, or takes it off. Blocking also
// removes every view that host sent from the log and the all-time count
// (each entry by value, so nothing arriving meanwhile is lost); those views
// are gone for good, unblocking only lets new ones in again.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
});

function parseEvents(raw, since) {
  const events = [];
  for (const s of raw || []) {
    let e; try { e = JSON.parse(s); } catch (_) { continue; }
    if (e.t > since) events.push(e);
  }
  return events;
}

async function feed(url) {
  if (!store()) return json({ configured: false, now: Date.now(), total: 0, events: [], blocked: [] });
  const since = Number(url.searchParams.get('since')) || 0;
  const span = since ? FEED_POLL : FEED_KEEP;
  const [raw, total, blocked] = await redis([['LRANGE', FEED_KEY, 0, span - 1], ['GET', COUNT_KEY], ['SMEMBERS', BLOCK_KEY]]);
  let events = parseEvents(raw, since);
  if (since && (raw || []).length === span && events.length === span) {
    const [more] = await redis([['LRANGE', FEED_KEY, span, FEED_KEEP - 1]]);
    events = events.concat(parseEvents(more, since));
  }
  return json({ configured: true, now: Date.now(), total: Number(total) || 0, events, blocked: (blocked || []).sort() });
}

const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
async function editBlocklist(request) {
  if (!store()) return json({ error: 'No store is connected' }, 503);
  let host = '', block = true;
  try {
    const body = JSON.parse(await request.text());
    host = String(body.host || '').trim().toLowerCase().replace(/^www\./, '');
    block = body.block !== false;
  } catch (_) {}
  if (!HOST_RE.test(host)) return json({ error: 'Not a host name' }, 400);
  let removed = 0;
  if (block) {
    const [raw] = await redis([['LRANGE', FEED_KEY, 0, -1]]);
    const gone = (raw || []).filter((s) => { try { return hostBlocked(hostOf(JSON.parse(s).ref), [host]); } catch (_) { return false; } });
    removed = gone.length;
    await redis([['SADD', BLOCK_KEY, host], ...gone.map((s) => ['LREM', FEED_KEY, 1, s]), ...(removed ? [['DECRBY', COUNT_KEY, removed]] : [])]);
  } else {
    await redis([['SREM', BLOCK_KEY, host]]);
  }
  blockedAt = 0;                                       // this instance re-reads the list on its next view
  const [blocked] = await redis([['SMEMBERS', BLOCK_KEY]]);
  return json({ blocked: (blocked || []).sort(), removed });
}


// ---- Gates ------------------------------------------------------------------

export default async function middleware(request, context) {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const isAdmin = url.pathname.startsWith('/admin');
  const isFeed = url.pathname === '/api/activity';
  const isPing = url.pathname === '/api/ping';
  const isWork = url.pathname.startsWith('/work/');

  // ---- Dashboard and its feed: the owner's password ----
  if (isAdmin || isFeed) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return isFeed ? json({ error: 'ADMIN_PASSWORD is not set' }, 503) : new Response(page({ path, unconfigured: true, admin: true }), { status: 503, headers });
    const expected = await adminTokenFor(password);
    const signedIn = readCookie(request, ADMIN_COOKIE) === expected;

    if (isFeed) {
      if (!signedIn) return json({ error: 'Sign in at /admin/ first' }, 401);
      return request.method === 'POST' ? editBlocklist(request) : feed(url);
    }

    if (request.method === 'GET' && url.searchParams.has('signout')) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/', 'Set-Cookie': setCookie(ADMIN_COOKIE, '', '/', 0), 'Cache-Control': 'no-store' },
      });
    }
    if (request.method === 'POST') {
      let submitted = '';
      try { submitted = String((await request.formData()).get('password') || '').trim(); } catch (_) {}
      if (submitted === password) {
        const h = new Headers({ Location: url.pathname, 'Cache-Control': 'no-store' });
        h.append('Set-Cookie', setCookie(ADMIN_COOKIE, expected, '/', ADMIN_MAX_AGE));
        h.append('Set-Cookie', setCookie(OWNER_COOKIE, '1', '/', OWNER_MAX_AGE));   // the owner's own visits stay out of the log
        return new Response(null, { status: 303, headers: h });
      }
      return new Response(page({ path, error: true, admin: true }), { status: 401, headers });
    }
    if (signedIn) return;                    // serve admin/index.html
    return new Response(page({ path, admin: true }), { status: 401, headers });
  }

  // ---- Everything else ----
  const password = process.env.CASE_STUDY_PASSWORD;
  if (isWork && !password) return new Response(page({ path, unconfigured: true }), { status: 503, headers });
  const expected = password ? await tokenFor(password) : 'unset';

  // ?owner marks this browser as mine: set the mute cookie and drop the param.
  if (request.method === 'GET' && url.searchParams.has('owner')) {
    url.searchParams.delete('owner');
    return new Response(null, {
      status: 303,
      headers: { Location: url.pathname + url.search, 'Set-Cookie': setCookie(OWNER_COOKIE, '1', '/', OWNER_MAX_AGE), 'Cache-Control': 'no-store' },
    });
  }
  const ua = request.headers.get('user-agent') || '';
  const muted = readCookie(request, OWNER_COOKIE) === '1' || isBot(ua) || isPrefetch(request.headers);
  const after = (p) => { if (context && typeof context.waitUntil === 'function') context.waitUntil(p); };
  const log = (kind, ref) => { if (!muted) after(logAccess(kind, request, url, expected, ref)); };

  if (isPing) {                              // the time-on-page beacon: same mute as the views, answered at once
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!muted) after(ping(request, expected));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!isWork) {                             // public page: record the view and serve it
    if (request.method === 'GET') log('viewed');
    return;
  }

  if (request.method === 'POST') {
    let submitted = '', ref = '';
    try {
      const form = await request.formData();
      submitted = String(form.get('password') || '').trim();
      ref = String(form.get('ref') || '').slice(0, 500);
    } catch (_) {}
    if (submitted === password) {
      log('unlocked', ref);
      url.searchParams.delete('unlocked');            // never doubled when the gate itself was reached with it
      const rest = url.searchParams.toString();
      return new Response(null, {                     // on to the case study with ?unlocked, which main.js answers with the opener once
        status: 303,
        headers: { Location: `${url.pathname}?${rest ? `${rest}&` : ''}unlocked`, 'Set-Cookie': setCookie(COOKIE, expected, '/work', MAX_AGE), 'Cache-Control': 'no-store' },
      });
    }
    log('wrong password', ref);
    return new Response(page({ path, error: true, ref }), { status: 401, headers });
  }

  if (readCookie(request, COOKIE) === expected) {   // unlocked: serve the page
    log('viewed');
    return;
  }
  if (process.env.ADMIN_PASSWORD && readCookie(request, ADMIN_COOKIE) === await adminTokenFor(process.env.ADMIN_PASSWORD)) return;   // the owner, signed in: no gate, and no log (the owner cookie mutes it)
  // Locked: record that the case study was tried, then show the gate. An external
  // referrer is carried through the form so the unlock log can name it too.
  const ref = refOf(request, url);
  if (request.method === 'GET') log('gated');
  return new Response(page({ path, ref: isExternal(ref) ? ref : '' }), { status: 401, headers });
}
