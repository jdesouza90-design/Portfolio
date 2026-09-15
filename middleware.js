// Vercel Edge Middleware — password gate for the case studies.
// Runs before the static files are served. Everything outside /work stays public.
//
// A correct password sends the reader on to the case study with ?unlocked, which
// main.js answers with the opener (the sheet that parts) exactly once.
//
// Access log: every unlock, page view and wrong password is written to Vercel's
// runtime logs, and emailed via Resend when RESEND_API_KEY and ACCESS_LOG_TO are set.
// Open any /work URL with ?owner once to mute logging for your own browser.

export const config = { matcher: '/work/:path*' };

const COOKIE = 'cs_access';
const MAX_AGE = 60 * 60 * 24 * 30;          // 30 days
const OWNER_COOKIE = 'cs_owner';
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;   // a year

async function tokenFor(password) {
  const bytes = new TextEncoder().encode(`cs-gate:v1:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

function page({ path, error, unconfigured, ref }) {
  const msg = unconfigured
    ? '<p class="gate-error t-small" id="gate-error" role="alert">The case-study password isn\'t configured yet. Set CASE_STUDY_PASSWORD in the Vercel project and redeploy.</p>'
    : error
      ? '<p class="gate-error t-small" id="gate-error" role="alert">That password didn\'t match. Check for extra spaces and try again.</p>'
      : '';
  const describe = msg ? ' aria-describedby="gate-error"' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Password required — John DeSouza</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg?v=fb53733d" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=93dc738c">
</head>
<body>
<main class="gate-wrap"><div class="gate">
  <a class="brand" href="/"><span>John DeSouza</span></a>
  <p class="eyebrow">Case studies</p>
  <h1 class="t-title">This case study is password protected.</h1>
  <p class="t-body">Enter the password I shared with you. Don't have it yet? <a href="https://www.linkedin.com/in/johndesouza-/" target="_blank" rel="noopener">Message me on LinkedIn</a> and I'll send it over.</p>
  <form method="post" action="${esc(path)}" class="gate-form">
    <label class="sr-only" for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Password"${error ? ' aria-invalid="true"' : ''}${describe}>${msg}${ref ? `
    <input type="hidden" name="ref" value="${esc(ref)}">` : ''}
    <button class="btn btn-primary" type="submit">Open case study</button>
  </form>
  <a class="back" href="/work.html">← Back to all work</a>
</div></main>
</body>
</html>`;
}


// ---- Access log -------------------------------------------------------------

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

// Vercel's IP geolocation headers (city is percent-encoded).
function whereFrom(h) {
  const dec = (v) => { try { return v && decodeURIComponent(v); } catch (_) { return v; } };
  return [dec(h.get('x-vercel-ip-city')), h.get('x-vercel-ip-country-region'), h.get('x-vercel-ip-country')]
    .filter(Boolean).join(', ') || 'unknown';
}

// Short stable id per visitor so one person's sequence of views can be followed.
// Hashed with the gate token so the raw IP is never stored or sent.
async function visitorId(request, salt) {
  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0].trim();
  const ua = request.headers.get('user-agent') || '';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${ua}|${salt}`));
  return Array.from(new Uint8Array(hash)).slice(0, 3).map((b) => b.toString(16).padStart(2, '0')).join('');
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

// kind: 'unlocked' | 'viewed' | 'wrong password'. Never throws — the gate must not break.
async function logAccess(kind, request, url, salt, ref) {
  try {
    const ua = request.headers.get('user-agent') || '';
    const entry = {
      kind,
      page: url.pathname.replace(/^\/work\//, '').replace(/\.html$/, ''),
      where: whereFrom(request.headers),
      ref: ref || refOf(request, url) || 'direct',
      device: describeUA(ua),
      visitor: await visitorId(request, salt),
      when: whenNow(),
    };
    console.log('access', JSON.stringify(entry));
    await sendEmail(
      `Case study ${kind}: ${entry.page} · ${entry.where}`,
      [
        `Event:     ${kind}`,
        `Page:      ${url.pathname}`,
        `When:      ${entry.when}`,
        `Where:     ${entry.where}`,
        `Referrer:  ${entry.ref}`,
        `Device:    ${entry.device}`,
        `Visitor:   ${entry.visitor}`,
        ``,
        `User agent: ${ua}`,
      ].join('\n'),
    );
  } catch (err) {
    console.error('access-log: failed', err);
  }
}

export default async function middleware(request, context) {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const password = process.env.CASE_STUDY_PASSWORD;

  if (!password) return new Response(page({ path, unconfigured: true }), { status: 503, headers });
  const expected = await tokenFor(password);

  // ?owner marks this browser as mine: set the mute cookie and drop the param.
  if (request.method === 'GET' && url.searchParams.has('owner')) {
    url.searchParams.delete('owner');
    return new Response(null, {
      status: 303,
      headers: {
        Location: url.pathname + url.search,
        'Set-Cookie': `${OWNER_COOKIE}=1; Path=/work; Max-Age=${OWNER_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const muted = readCookie(request, OWNER_COOKIE) === '1';
  const log = (kind, ref) => {
    if (muted) return;
    const p = logAccess(kind, request, url, expected, ref);
    if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
  };

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
      return new Response(null, {
        status: 303,
        headers: {
          Location: `${url.pathname}?${rest ? `${rest}&` : ''}unlocked`,
          'Set-Cookie': `${COOKIE}=${expected}; Path=/work; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
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
