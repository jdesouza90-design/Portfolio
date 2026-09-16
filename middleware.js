// Vercel Edge Middleware — the two password gates and the activity log.
// Runs before the static files are served.
//
//   /work/*         the case-study password (CASE_STUDY_PASSWORD)
//   /admin/*        the activity dashboard, its own password (ADMIN_PASSWORD)
//   /api/activity   the feed the dashboard polls; needs the admin cookie
//   everything else public, but every page view is recorded
//
// A correct case-study password sends the reader on with ?unlocked, which
// main.js answers with the opener (the sheet that parts) exactly once.
//
// Activity log: every page view on the site, every case-study unlock and every
// wrong password is written to Vercel's runtime logs and, when an Upstash Redis
// store is connected (KV_REST_API_URL / KV_REST_API_TOKEN), kept there for the
// dashboard. Case-study events are also emailed via Resend when RESEND_API_KEY
// and ACCESS_LOG_TO are set. Signing in to the dashboard, or opening any page
// once with ?owner, mutes logging for your own browser.

export const config = { matcher: ['/', '/index.html', '/work.html', '/work/:path*', '/admin/:path*', '/api/activity'] };

const COOKIE = 'cs_access';
const MAX_AGE = 60 * 60 * 24 * 30;          // 30 days
const ADMIN_COOKIE = 'admin_access';
const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;    // 30 days
const OWNER_COOKIE = 'cs_owner';
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;   // a year

const FEED_KEY = 'activity';                // Redis list, newest first
const COUNT_KEY = 'activity:count';         // all-time page views
const FEED_KEEP = 2000;                     // entries kept in the list
const FEED_PAGE = 500;                      // entries the dashboard loads

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
<link rel="stylesheet" href="/styles.css?v=28b1b7f1">
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

// kind: 'viewed' | 'unlocked' | 'wrong password'. Never throws — the pages must not break.
// Every event goes to the runtime log and the store; case-study events are emailed too.
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
    console.log('access', JSON.stringify(entry));
    const jobs = [
      redis([
        ['LPUSH', FEED_KEY, JSON.stringify(entry)],
        ['LTRIM', FEED_KEY, 0, FEED_KEEP - 1],
        ['INCR', COUNT_KEY],
      ]).catch((err) => console.error('access-log: store failed', err)),
    ];
    if (url.pathname.startsWith('/work/')) {
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


// ---- The feed ---------------------------------------------------------------
// GET /api/activity?since=<ms>  →  { configured, now, total, events }
// `events` is newest first, only those after `since` when it is given.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
});

async function feed(url) {
  if (!store()) return json({ configured: false, now: Date.now(), total: 0, events: [] });
  const since = Number(url.searchParams.get('since')) || 0;
  const [raw, total] = await redis([['LRANGE', FEED_KEY, 0, FEED_PAGE - 1], ['GET', COUNT_KEY]]);
  const events = [];
  for (const s of raw || []) {
    let e; try { e = JSON.parse(s); } catch (_) { continue; }
    if (e.t <= since) break;                 // newest first, so the rest are older too
    events.push(e);
  }
  return json({ configured: true, now: Date.now(), total: Number(total) || 0, events });
}


// ---- Gates ------------------------------------------------------------------

export default async function middleware(request, context) {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const isAdmin = url.pathname.startsWith('/admin');
  const isFeed = url.pathname === '/api/activity';
  const isWork = url.pathname.startsWith('/work/');

  // ---- Dashboard and its feed: the owner's password ----
  if (isAdmin || isFeed) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return isFeed ? json({ error: 'ADMIN_PASSWORD is not set' }, 503) : new Response(page({ path, unconfigured: true, admin: true }), { status: 503, headers });
    const expected = await adminTokenFor(password);
    const signedIn = readCookie(request, ADMIN_COOKIE) === expected;

    if (isFeed) return signedIn ? feed(url) : json({ error: 'Sign in at /admin/ first' }, 401);

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
  const log = (kind, ref) => {
    if (muted) return;
    const p = logAccess(kind, request, url, expected, ref);
    if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
  };

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
  // Carry an external referrer through the form so the unlock log can name it.
  const ref = refOf(request, url);
  return new Response(page({ path, ref: isExternal(ref) ? ref : '' }), { status: 401, headers });
}
