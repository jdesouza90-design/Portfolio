// Vercel Edge Middleware — the two password gates and the activity log.
// Runs before the static files are served.
//
//   /work/*         the case-study password (CASE_STUDY_PASSWORD); the owner's
//                   admin cookie opens them too, and so does an unlock in the chat
//   /admin/*        the dashboard, the owner's password (ADMIN_PASSWORD)
//   /api/activity   the feed the dashboard polls, and the referrer blocklist it
//                   edits (POST); needs the admin cookie
//   /api/ping       the beacon main.js sends with the time a page has been read
//   /api/scores     the Nine holes leaderboard: read it (GET), post a round (POST)
//   /api/board      the leaderboard as the dashboard edits it: every entry, delete
//                   one, ban or unban a word; needs the admin cookie
//   /api/chat-settings the chat's settings, read and saved from the dashboard;
//                   needs the admin cookie
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
//
// The chat (api/chat.js) is a function of its own, not matched here, but it
// shares this file's helpers (the exports below): the unlock cookie, which is
// why that cookie covers the whole site, the store, the visitor id and the
// log. Its questions are kept in chat:log and read by the dashboard's Chat page
// (/api/activity?chats).

export const config = { matcher: ['/', '/index.html', '/work.html', '/work/:path*', '/admin/:path*', '/api/activity', '/api/ping', '/api/scores', '/api/board', '/api/chat-settings'] };

export const COOKIE = 'cs_access';
export const MAX_AGE = 60 * 60 * 24 * 30;   // 30 days
export const ADMIN_COOKIE = 'admin_access';
const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;    // 30 days
export const OWNER_COOKIE = 'cs_owner';
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;   // a year

export const CHAT_KEY = 'chat:log';         // Redis list of the chat's questions and answers, newest first
export const CHAT_KEEP = 1000;              // entries kept
const CHAT_POLL = 50;                       // entries a poll reads
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
export const tokenFor = (password) => sha256(`cs-gate:v1:${password}`);
export const adminTokenFor = (password) => sha256(`admin-gate:v1:${password}`);

// Every value a cookie name carries. Two can arrive under one name: the
// unlock cookie moved from Path=/work to Path=/, and a browser holding both
// sends the /work one first.
export function cookieValues(request, name) {
  const out = [];
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) out.push(rest.join('='));
  }
  return out;
}
export const readCookie = (request, name) => cookieValues(request, name)[0] ?? null;
export const setCookie = (name, value, path, maxAge) => `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

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
<link rel="stylesheet" href="/styles.css?v=9b1ab6f8">
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
export async function redis(commands) {
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

// A source named on the link itself: /work/staking.html?from=slack. Some places
// a link is shared send no referrer at all — Slack marks every link it shows
// no-referrer, and the desktop app hands the URL to the browser with nothing
// attached, so a click from either arrives indistinguishable from someone
// typing the address in. Tagging the link is the only thing that survives that,
// so a tag wins over the referrer when both are there: it is the one the sender
// meant. Recorded in the same field as the referrer, which keeps it out of the
// spam blocklist (that only ever matches a host) and through the gate.
const FROM = 'from:';
const fromTag = (url) => {
  const t = (url.searchParams.get('from') || '').toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(t) ? FROM + t : '';
};
// Referrer with its query string dropped (LinkedIn et al. append tracking params).
// Same-host referrers come back as a bare path, external ones as origin + path.
function refOf(request, url) {
  const tag = fromTag(url);
  if (tag) return tag;
  try {
    const r = new URL(request.headers.get('referer') || '');
    return r.host === url.host ? r.pathname : r.origin + r.pathname;
  } catch (_) { return ''; }
}
const isExternal = (ref) => /^https?:/.test(ref);
// What is worth carrying through the password gate, so an unlock is credited to
// the place the link came from: somewhere else on the web, or a tagged link.
const isSource = (ref) => isExternal(ref) || ref.startsWith(FROM);
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
export function describeUA(ua) {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown browser';
  return `${browser} on ${os}`;
}

// Crawlers and link previewers; their fetches aren't visits. Four families of
// them, and a term earns its place here only if no browser could carry it: a
// name matched too eagerly loses a reader for good, since what is never
// recorded can never be got back. What no user agent gives away is the scanner
// that sends a plain Chrome string — most of what arrives from the cloud
// regions — so the dashboard reads the time beacons for that one instead
// ("Real visits only" in admin/dash.js), and this list stays conservative.
const BOT_RE = new RegExp([
  // Says so itself: the crawlers, the SEO robots, the AI agents.
  'bot|crawl|spider|slurp|scraper|archiver|heritrix|nutch|feedfetcher|anthropic-ai|chatgpt-user|oai-searchbot|claude-user|perplexity-user|meta-externalagent|cohere-ai|img2dataset|omgili',
  'google-read-aloud|googleother|google-inspectiontool|google-apps-script|googleimageproxy',
  // Link previews, and the apps that draw them.
  // Slackbot, Discordbot and TelegramBot are the crawlers those three send and
  // `bot` above has them already; their own names are not here, because the
  // desktop apps put them in the user agent of a person reading (Slack_SSB).
  'preview|facebookexternalhit|whatsapp|skype|embedly|iframely|quora|pinterest|vkshare|mastodon|bluesky|snapchat|vercel-screenshot|vercel-favicon',
  // Headless browsers and the HTTP libraries, which is how a scraper arrives
  // when it hasn't bothered to dress up as anything.
  'headless|phantomjs|puppeteer|playwright|selenium|webdriver|curl|wget|python-requests|urllib|aiohttp|httpx|scrapy|go-http-client|node-fetch|undici|axios|okhttp|apache-httpclient|java/|libwww-perl|guzzle|postmanruntime|insomnia|restsharp|winhttp',
  // The mail filters and security scanners a shared link goes through before
  // anyone clicks it, and the uptime monitors.
  'safelinks|proofpoint|mimecast|barracuda|forcepoint|symantec|trendmicro|sophos|ironport|messagelabs|zscaler|netskope|bitdefender|microsoft office|ms-office|msoffice|microsoft-cryptoapi',
  'lighthouse|pingdom|uptime|statuscake|monitoring|site24x7|newrelic|datadog|checkly|w3c_validator',
].join('|'), 'i');
export const isBot = (ua) => !ua || BOT_RE.test(ua);   // exported for bot-check.mjs and the chat; the edge runtime reads only `default` and `config`
// Speculative loads (link prefetch, prerender) that nobody has looked at.
const isPrefetch = (h) => /prefetch|prerender/i.test(h.get('purpose') || h.get('sec-purpose') || h.get('x-purpose') || '');

// Vercel's IP geolocation headers (city is percent-encoded).
export function whereFrom(h) {
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
export async function visitorId(request, salt) {
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
// every unlock's mail. A password typed into the chat is logged at /api/chat and
// mailed the same way.
export async function logAccess(kind, request, url, salt, ref) {
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
    const inChat = url.pathname === '/api/chat';
    if ((url.pathname.startsWith('/work/') || inChat) && kind !== 'gated') {
      const name = inChat ? 'in the chat' : url.pathname.replace(/^\/work\//, '').replace(/\.html$/, '');
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


// ---- Leaderboard -------------------------------------------------------------
// GET /api/scores                 →  { configured, scores: [{name, score}], settings }
// POST /api/scores {name, score}  →  { configured, scores, settings, rank }
// The Nine holes board: fewest strokes first, ties to whoever got there first.
// A sorted set scored by strokes whose members are `<ms>:<NAME>`, so equal
// scores fall into time order and the same name can hold more than one place.
// Names are drawn on the game's pixel face, so only A–Z, 0–9 and single
// spaces survive, ten at most. A round is 9 holes at one stroke or more, and a
// visitor may post once every RATE_SECS. Anything past the first BOARD_KEEP
// places is dropped.

const BOARD_KEY = 'golf:board';
const BOARD_SHOW = 5;                       // places the game draws
const BOARD_KEEP = 100;                     // places kept
const RATE_SECS = 20;
const SETTINGS_KEY = 'golf:settings';       // the game's settings as the dashboard last saved them, JSON

// What the dashboard can tune, as [default, least, most, step]. The game
// plays the defaults until something is saved, and whenever the store is out.
const GAME = {
  holes: [9, 1, 18, 1],                     // holes in a round
  par: [3, 2, 6, 1],                        // par on each hole
  cup: [5, 3, 11, 2],                       // the cup's width in game pixels, odd
  putt: [28, 0, 60, 1],                     // how close to the cup the putter comes out; 0 never
  wind: [25, 0, 60, 1],                     // the strongest wind a hole can have
  aim: [1.4, 0.5, 3, 0.1],                  // seconds for the aim arrow's full swing
  power: [1, 0.4, 3, 0.1],                  // seconds for the power meter's full swing
  hazards: [65, 0, 100, 5],                 // percent of holes with a bunker or a pond
};
function settingsFrom(raw) {
  let o = {};
  try { o = (typeof raw === 'string' ? JSON.parse(raw) : raw) || {}; } catch (_) {}
  const out = {};
  for (const [k, [d, lo, hi, step]] of Object.entries(GAME)) {
    let v = Number(o[k]);
    if (!Number.isFinite(v)) v = d;
    v = k === 'cup' ? Math.round((v - 1) / 2) * 2 + 1 : Math.round(v / step) * step;
    out[k] = Number(Math.min(hi, Math.max(lo, v)).toFixed(2));
  }
  out.open = o.open !== false;              // whether the board takes new rounds
  return out;
}
const BAN_KEY = 'golf:banned';              // Redis set of words the owner has kept off the board, beside the list below

// Names that never reach the board. Digits are read as the letters they stand
// in for (5H1T), spaces are dropped (F U C K), and each check is made twice:
// on the name as typed and squeezed, runs of a letter cut to one (FUUUCK).
// BAD is matched anywhere in the name, so it lists a squeezed spelling beside
// any word with a double letter; WORDS only as a whole word or the whole name
// (a plural s allowed), because as fragments they sit inside ordinary names:
// CLASS, HANCOCK, GRAPE, SPICY, RACCOON, TORPEDO, SUSSEX, CANAL. The owner's
// own banned words (the dashboard) are matched anywhere, as BAD is.
const BAD = ['FUCK', 'FUK', 'FCUK', 'FVCK', 'SHIT', 'CUNT', 'NIGG', 'NIGA', 'NIGR', 'NIGER', 'FAGGOT', 'FAGOT', 'PUSSY', 'PUSY', 'WHORE', 'SLUT',
  'BITCH', 'BASTARD', 'ASSHOLE', 'ASHOLE', 'ARSEHOLE', 'PENIS', 'VAGIN', 'DILDO', 'JIZZ', 'JIZ', 'TWAT', 'WANK', 'KIKE', 'CHINK', 'RETARD',
  'NAZI', 'HITLER', 'KKK', 'PORN', 'MOLEST', 'WETBACK', 'TRANNY', 'TRANY', 'BOLLOCK', 'BOLOCK', 'BLOWJOB', 'HANDJOB', 'SEMEN', 'CLIT', 'RAPIST',
  'PEDOPHIL', 'COCKSUCK', 'COKSUCK', 'TITTIE', 'TITIE', 'BOOBIE', 'MOTHERF', 'DICKHEAD', 'DIKHEAD', 'SKANK', 'SCHLONG', 'TESTICL', 'ERECTION', 'ORGASM'];
const WORDS = ['ASS', 'ASSES', 'ARSE', 'TIT', 'TITS', 'TITY', 'TITTY', 'COCK', 'COK', 'DICK', 'DIK', 'CUM', 'RAPE', 'SPIC', 'COON', 'HOMO', 'FAG',
  'SEX', 'SEXY', 'ANAL', 'ANUS', 'PEDO', 'NUDE', 'BOOB', 'DYKE', 'PISS', 'NIG', 'JAP', 'GOOK', 'HOE', 'THOT', 'NIGGA', 'NIGA', 'PRICK', 'BALLS', 'BUTT'];
const LEET = { 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T', 8: 'B', 9: 'G' };
const squeeze = (s) => s.replace(/(.)\1+/g, '$1');
function banned(name, extra = []) {
  const read = name.replace(/[0-9]/g, (d) => LEET[d] || d);
  const words = read.split(' ').filter(Boolean);
  const plain = read.replace(/ /g, '');
  const forms = [plain, squeeze(plain)];
  const isWord = (w) => WORDS.includes(w) || (/[SZ]$/.test(w) && WORDS.includes(w.slice(0, -1)));
  if ([...words, ...words.map(squeeze), ...forms].some(isWord)) return true;
  return BAD.concat(extra).some((b) => b && forms.some((f) => f.includes(b)));
}

const cleanName = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10).trim();

async function board() {
  const [raw, set] = await redis([['ZRANGE', BOARD_KEY, 0, BOARD_SHOW - 1, 'WITHSCORES'], ['GET', SETTINGS_KEY]]);
  const scores = [];
  for (let i = 0; i + 1 < (raw || []).length; i += 2) scores.push({ name: String(raw[i]).replace(/^\d+:/, ''), score: Number(raw[i + 1]) });
  return { scores, settings: settingsFrom(set) };
}

async function scores(request, salt) {
  if (!store()) return json({ configured: false, scores: [], settings: settingsFrom(null) });
  if (request.method === 'GET') return json({ configured: true, ...(await board()) });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  let name = '', score = 0;
  try {
    const body = JSON.parse(await request.text());
    name = cleanName(body.name);
    score = Number(body.score);
  } catch (_) {}
  if (!name) return json({ error: 'A name needs a letter or a number' }, 400);
  const [set, extra] = await redis([['GET', SETTINGS_KEY], ['SMEMBERS', BAN_KEY]]);
  if (banned(name, extra || [])) return json({ error: 'That name can\'t go on the board. Pick another' }, 400);
  const settings = settingsFrom(set);
  if (!settings.open) return json({ error: 'The leaderboard is closed to new rounds for now' }, 403);
  if (!Number.isInteger(score) || score < settings.holes || score > 999) return json({ error: 'Not a whole round' }, 400);
  const [fresh] = await redis([['SET', `golf:rate:${await visitorId(request, salt)}`, '1', 'EX', RATE_SECS, 'NX']]);
  if (!fresh) return json({ error: 'One round at a time. Try again in a few seconds' }, 429);
  const member = `${Date.now()}:${name}`;
  const [, rank] = await redis([['ZADD', BOARD_KEY, score, member], ['ZRANK', BOARD_KEY, member], ['ZREMRANGEBYRANK', BOARD_KEY, BOARD_KEEP, -1]]);
  return json({ configured: true, ...(await board()), rank: rank === null || rank >= BOARD_KEEP ? null : rank + 1 });
}


// GET /api/board                  →  { entries: [{id, name, score, t}], banned }
// POST /api/board {remove: id}     →  the same, without that entry
// POST /api/board {ban: word}      →  the same, the word added and every name it catches gone, plus {removed}
// POST /api/board {unban: word}    →  the same, the word taken off
// POST /api/board {clear: true}    →  the same, every entry gone
// POST /api/board {settings: {…}}  →  the same, the game's settings saved (clamped to GAME)
// Every kept place, the banned words and the settings, for the dashboard's Nine holes section.
async function boardAdmin(request) {
  if (!store()) return json({ error: 'No store is connected' }, 503);
  let removed = 0;
  if (request.method === 'POST') {
    let body = {};
    try { body = JSON.parse(await request.text()) || {}; } catch (_) {}
    if (body.settings && typeof body.settings === 'object') {
      await redis([['SET', SETTINGS_KEY, JSON.stringify(settingsFrom(body.settings))]]);
    } else if (body.clear === true) {
      [removed] = await redis([['ZCARD', BOARD_KEY]]);
      await redis([['DEL', BOARD_KEY]]);
    } else if (typeof body.remove === 'string') {
      [removed] = await redis([['ZREM', BOARD_KEY, body.remove]]);
    } else if (typeof body.ban === 'string' || typeof body.unban === 'string') {
      const word = cleanName(body.ban ?? body.unban).replace(/ /g, '');
      if (!word) return json({ error: 'A word needs a letter or a number' }, 400);
      if (typeof body.unban === 'string') await redis([['SREM', BAN_KEY, word]]);
      else {
        const [all] = await redis([['ZRANGE', BOARD_KEY, 0, -1]]);
        const gone = (all || []).filter((m) => banned(String(m).replace(/^\d+:/, ''), [word]));
        removed = gone.length;
        await redis([['SADD', BAN_KEY, word], ...(removed ? [['ZREM', BOARD_KEY, ...gone]] : [])]);
      }
    } else return json({ error: 'Nothing to do' }, 400);
  }
  const [raw, words, set] = await redis([['ZRANGE', BOARD_KEY, 0, -1, 'WITHSCORES'], ['SMEMBERS', BAN_KEY], ['GET', SETTINGS_KEY]]);
  const entries = [];
  for (let i = 0; i + 1 < (raw || []).length; i += 2) {
    const id = String(raw[i]), m = /^(\d+):(.*)$/.exec(id) || [, 0, id];
    entries.push({ id, name: m[2], score: Number(raw[i + 1]), t: Number(m[1]) });
  }
  return json({ entries, banned: (words || []).sort(), settings: settingsFrom(set), limits: GAME, removed });
}


// ---- The feed ---------------------------------------------------------------
// GET /api/activity?since=<ms>  →  { configured, now, total, events, blocked, chats }
// `events` is newest first, only those after `since` when it is given. The
// first load takes everything kept; a poll reads a short window and only goes
// further back when every entry in it turned out to be new. `blocked` is the
// referrer blocklist, so the dashboard can hide and unblock. `chats` is the
// chat's questions and answers the same way (newest first, after `since`).
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
  if (!store()) return json({ configured: false, now: Date.now(), total: 0, events: [], blocked: [], chats: [] });
  const since = Number(url.searchParams.get('since')) || 0;
  if (url.searchParams.has('chats')) {                 // the Chat page (admin/chat.js) reads the questions alone
    const [chatRaw] = await redis([['LRANGE', CHAT_KEY, 0, (since ? CHAT_POLL : CHAT_KEEP) - 1]]);
    return json({ configured: true, now: Date.now(), chats: parseEvents(chatRaw, since) });
  }
  const span = since ? FEED_POLL : FEED_KEEP;
  const [raw, total, blocked, chatRaw] = await redis([['LRANGE', FEED_KEY, 0, span - 1], ['GET', COUNT_KEY], ['SMEMBERS', BLOCK_KEY], ['LRANGE', CHAT_KEY, 0, (since ? CHAT_POLL : CHAT_KEEP) - 1]]);
  let events = parseEvents(raw, since);
  if (since && (raw || []).length === span && events.length === span) {
    const [more] = await redis([['LRANGE', FEED_KEY, span, FEED_KEEP - 1]]);
    events = events.concat(parseEvents(more, since));
  }
  return json({ configured: true, now: Date.now(), total: Number(total) || 0, events, blocked: (blocked || []).sort(), chats: parseEvents(chatRaw, since) });
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


// ---- Chat settings ----------------------------------------------------------
// GET /api/chat-settings  →  { store, key, settings, models, defaults }
// POST /api/chat-settings {settings}  →  { settings }, as saved
// What the dashboard's Chat settings form edits: whether the chat shows at
// all, the model, the two limits, the suggested questions and John's notes
// for the assistant. Kept in the store as one JSON value; without a store the
// defaults below apply and nothing can be saved. The chat reads them through
// chatSettings(), each instance keeping its copy for CHAT_SETTINGS_TTL, so a save
// reaches every visitor within half a minute and no redeploy is needed.
// The API key is not a setting: it stays in Vercel's environment variables.

export const CHAT_MODELS = { 'claude-haiku-4-5': 'Claude Haiku 4.5', 'claude-sonnet-5': 'Claude Sonnet 5' };
export const CHAT_DEFAULTS = {
  on: true,
  model: 'claude-haiku-4-5',
  hourLimit: 30,                  // questions one visitor may ask in an hour
  dayLimit: 200,                  // questions the whole site answers in a day: the cost ceiling
  chatLimit: 8,                   // questions one conversation may ask before it ends on John's contact links
  starters: ['What kind of role is John looking for?', 'How does John run a design team?', 'What has John done with AI agents?', 'Tell me about the Staking work'],
  // The suggestions a page of each kind shows instead: {project} is the case study's name.
  caseStarters: ["What was John's role on {project}?", 'What were the results?', 'What was the hardest part?', 'Who was on the team?'],
  postStarters: ["What's the main argument here?", "How does this show up in John's own work?", 'What else has he written?'],
  workStarters: ['Which project best shows how John leads?', 'Which work involved AI agents?', 'What were his biggest results?'],
  notes: '',                      // what the pages don't say, in John's words; the assistant may repeat it
};
const CHAT_SETTINGS_KEY = 'chat:settings';
const CHAT_SETTINGS_TTL = 30000;  // ms an instance keeps its copy

const STARTER_KEYS = ['starters', 'caseStarters', 'postStarters', 'workStarters'];
export function cleanSettings(raw) {
  const s = { ...CHAT_DEFAULTS };
  for (const k of STARTER_KEYS) s[k] = [...CHAT_DEFAULTS[k]];
  if (!raw || typeof raw !== 'object') return s;
  const whole = (v, lo, hi, d) => { const n = Math.round(Number(v)); return v !== '' && v != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  if (typeof raw.on === 'boolean') s.on = raw.on;
  if (typeof raw.model === 'string' && Object.hasOwn(CHAT_MODELS, raw.model)) s.model = raw.model;
  s.hourLimit = whole(raw.hourLimit, 1, 200, s.hourLimit);
  s.dayLimit = whole(raw.dayLimit, 0, 5000, s.dayLimit);
  s.chatLimit = whole(raw.chatLimit, 1, 50, s.chatLimit);
  for (const k of STARTER_KEYS) {
    if (Array.isArray(raw[k])) s[k] = raw[k].map((q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)).filter(Boolean).slice(0, 4);
  }
  if (typeof raw.notes === 'string') s.notes = raw.notes.replace(/\r\n?/g, '\n').trim().slice(0, 2000);
  return s;
}

let settingsAt = 0, settingsCopy = null;
export async function chatSettings() {
  if (settingsCopy && Date.now() - settingsAt < CHAT_SETTINGS_TTL) return settingsCopy;
  try {
    const [raw] = (await redis([['GET', CHAT_SETTINGS_KEY]])) || [null];
    settingsCopy = cleanSettings(raw ? JSON.parse(raw) : null);
    settingsAt = Date.now();
  } catch (err) {
    console.error('settings: read failed', err);                // the last copy serves until the store answers
    settingsCopy ||= cleanSettings(null);
  }
  return settingsCopy;
}

async function settingsRoute(request) {
  const info = (settings) => json({ store: !!store(), key: !!process.env.ANTHROPIC_API_KEY, settings, models: CHAT_MODELS, defaults: CHAT_DEFAULTS });
  if (request.method !== 'POST') { settingsAt = 0; return info(await chatSettings()); }
  if (!store()) return json({ error: 'No store is connected, so settings cannot be saved.' }, 503);
  let body = null;
  try { body = JSON.parse(await request.text()); } catch (_) {}
  if (!body || typeof body.settings !== 'object') return json({ error: 'No settings sent' }, 400);
  const settings = cleanSettings(body.settings);
  await redis([['SET', CHAT_SETTINGS_KEY, JSON.stringify(settings)]]);
  settingsCopy = settings; settingsAt = Date.now();
  return info(settings);
}


// ---- Gates ------------------------------------------------------------------

export default async function middleware(request, context) {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const isAdmin = url.pathname.startsWith('/admin');
  const isFeed = url.pathname === '/api/activity';
  const isSettings = url.pathname === '/api/chat-settings';
  const isPing = url.pathname === '/api/ping';
  const isScores = url.pathname === '/api/scores';
  const isBoard = url.pathname === '/api/board';
  const isWork = url.pathname.startsWith('/work/');

  // ---- Dashboard, its feed, the board and the chat settings: the owner's password ----
  if (isAdmin || isFeed || isBoard || isSettings) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return isAdmin ? new Response(page({ path, unconfigured: true, admin: true }), { status: 503, headers }) : json({ error: 'ADMIN_PASSWORD is not set' }, 503);
    const expected = await adminTokenFor(password);
    const signedIn = readCookie(request, ADMIN_COOKIE) === expected;

    if (isBoard) {
      if (!signedIn) return json({ error: 'Sign in at /admin/ first' }, 401);
      return boardAdmin(request).catch((err) => { console.error('board: failed', err); return json({ error: 'The store is not answering' }, 502); });
    }
    if (isFeed || isSettings) {
      if (!signedIn) return json({ error: 'Sign in at /admin/ first' }, 401);
      if (isSettings) return settingsRoute(request);
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
  if (isScores) return scores(request, expected).catch((err) => { console.error('scores: failed', err); return json({ error: 'The board is not answering' }, 502); });

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
      const h = new Headers({ Location: `${url.pathname}?${rest ? `${rest}&` : ''}unlocked`, 'Cache-Control': 'no-store' });   // on to the case study with ?unlocked, which main.js answers with the opener once
      h.append('Set-Cookie', setCookie(COOKIE, expected, '/', MAX_AGE));   // site-wide, so the chat knows too
      h.append('Set-Cookie', setCookie(COOKIE, '', '/work', 0));           // and the copy an older unlock left at /work goes
      return new Response(null, { status: 303, headers: h });
    }
    log('wrong password', ref);
    return new Response(page({ path, error: true, ref }), { status: 401, headers });
  }

  if (cookieValues(request, COOKIE).includes(expected)) {   // unlocked (at the gate or in the chat): serve the page
    log('viewed');
    return;
  }
  if (process.env.ADMIN_PASSWORD && readCookie(request, ADMIN_COOKIE) === await adminTokenFor(process.env.ADMIN_PASSWORD)) return;   // the owner, signed in: no gate, and no log (the owner cookie mutes it)
  // Locked: record that the case study was tried, then show the gate. Where the
  // visit came from — another site, or the tag on the link — is carried through
  // the form so the unlock log can name it too.
  const ref = refOf(request, url);
  if (request.method === 'GET') log('gated');
  return new Response(page({ path, ref: isSource(ref) ? ref : '' }), { status: 401, headers });
}
