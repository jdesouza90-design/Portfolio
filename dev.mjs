#!/usr/bin/env node
// Local stand-in for Vercel's edge: serves the static files through
// middleware.js, and /api/chat through api/chat.js, with an in-memory Redis
// and made-up geolocation, so the gates, the chat and the activity dashboard
// can be exercised without deploying.
//
//   node dev.mjs            → http://127.0.0.1:4174
//   password for /work:     cs        dashboard: admin
//
// Each browser is given a made-up city and address in a cookie on its first
// request, so its views and time-on-page beacons pair up as they would live;
// open pages in a private window (the dashboard's own browser is muted) to
// see the dashboard move. SEED=0 skips the sample history.
//
// The chat answers from a scripted stand-in for Claude, so nothing is spent
// and no key is needed; it streams, links, lists and asks for the password
// the way the real one does. Run with ANTHROPIC_API_KEY set to talk to Claude.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

process.env.CASE_STUDY_PASSWORD ||= 'cs';
process.env.ADMIN_PASSWORD ||= 'admin';
process.env.KV_REST_API_URL = 'http://store.local';
process.env.KV_REST_API_TOKEN = 'local';
process.chdir(path.dirname(new URL(import.meta.url).pathname));   // the chat reads the pages from the working directory, as it does on Vercel
const MOCK_CLAUDE = !process.env.ANTHROPIC_API_KEY;
if (MOCK_CLAUDE) process.env.ANTHROPIC_API_KEY = 'dev-stand-in';

// ---- In-memory Redis behind the REST shape middleware.js speaks ----
const lists = new Map(), values = new Map(), sets = new Map(), zsets = new Map(), expires = new Map();   // a sorted set is [[score, member]], kept in order
const zsorted = (key) => (zsets.get(key) || []).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
const live = (key) => { const at = expires.get(key); if (at && at <= Date.now()) { values.delete(key); expires.delete(key); } return values.has(key); };
const cmd = ([op, key, ...args]) => {
  switch (op) {
    case 'LPUSH': { const l = lists.get(key) || []; l.unshift(...args); lists.set(key, l); return l.length; }
    case 'LTRIM': { const l = lists.get(key) || []; lists.set(key, l.slice(Number(args[0]), Number(args[1]) + 1)); return 'OK'; }
    case 'LRANGE': { const l = lists.get(key) || []; const end = Number(args[1]); return l.slice(Number(args[0]), end < 0 ? undefined : end + 1); }
    case 'LREM': { const l = lists.get(key) || []; const i = l.indexOf(args[1]); if (i < 0) return 0; l.splice(i, 1); return 1; }   // count 1: the first match
    case 'INCR': { live(key); const v = (Number(values.get(key)) || 0) + 1; values.set(key, String(v)); return v; }
    case 'DECRBY': { const v = (Number(values.get(key)) || 0) - Number(args[0]); values.set(key, String(v)); return v; }
    case 'GET': return live(key) ? values.get(key) : null;
    case 'SET': {                                                   // SET key value [EX secs] [NX]
      const opts = args.slice(1).map(String), nx = opts.includes('NX'), ex = opts.indexOf('EX');
      if (nx && live(key)) return null;
      values.set(key, String(args[0]));
      if (ex >= 0) expires.set(key, Date.now() + Number(opts[ex + 1]) * 1000); else expires.delete(key);
      return 'OK';
    }
    case 'ZADD': { const z = zsorted(key).filter((e) => e[1] !== args[1]); z.push([Number(args[0]), args[1]]); zsets.set(key, z); return 1; }
    case 'ZREM': { const z = zsorted(key); const keep = z.filter((e) => !args.includes(e[1])); zsets.set(key, keep); return z.length - keep.length; }
    case 'ZCARD': return (zsets.get(key) || []).length;
    case 'DEL': { expires.delete(key); const had = [lists, values, sets, zsets].some((m) => m.delete(key)); return had ? 1 : 0; }
    case 'ZRANK': { const i = zsorted(key).findIndex((e) => e[1] === args[0]); return i < 0 ? null : i; }
    case 'ZRANGE': { const z = zsorted(key), end = Number(args[1]); const part = z.slice(Number(args[0]), end < 0 ? z.length + end + 1 : end + 1); return args.includes('WITHSCORES') ? part.flatMap(([sc, m]) => [m, String(sc)]) : part.map((e) => e[1]); }
    case 'ZREMRANGEBYRANK': { const z = zsorted(key), start = Number(args[0]); const n = z.length > start ? z.length - start : 0; zsets.set(key, z.slice(0, start)); return n; }
    case 'SADD': { const st = sets.get(key) || new Set(); const before = st.size; for (const a of args) st.add(a); sets.set(key, st); return st.size - before; }
    case 'SREM': { const st = sets.get(key) || new Set(); let n = 0; for (const a of args) n += st.delete(a) ? 1 : 0; return n; }
    case 'SMEMBERS': return [...(sets.get(key) || [])];
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
  if (MOCK_CLAUDE && String(url).startsWith('https://api.anthropic.com/v1/messages')) return standIn(JSON.parse(init.body));
  return realFetch(url, init);
};

// ---- A scripted Claude ----
// Answers in the Messages API's own event stream, a few words at a time. With
// the case studies locked, a question about results or numbers gets one
// sentence and the ask_for_password tool, as the brief tells the real one to.
function standIn(body) {
  const unlocked = body.system.some((b) => b.text.startsWith('<case_studies>'));
  const last = body.messages[body.messages.length - 1];
  const q = String(last.content).replace(/\s+/g, ' ').slice(0, 120);
  const wantsDetail = /result|number|metric|how many|how much|process|screens?|password|detail/i.test(q);
  const events = [];
  const ev = (type, data) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  const text = !unlocked && wantsDetail
    ? 'That detail is in the password-protected case study, so it opens once you enter the password.'
    : unlocked && wantsDetail
      ? `Unlocked, so here are the numbers. The [Staking case study](/work/staking.html) reached **25M LINK** staked, with the pool full within three hours of launch.\n\n- One product designer, across three time zones\n- Launched December 2022\n\n(Local stand-in, not Claude. You asked: "${q}")`
      : `This is the local stand-in, not Claude, so the answer is scripted. On the live site Claude reads the pages and answers "${q}" from them.\n\nFor example, [the Staking case study](/work/staking.html) puts **pool capacity**, reward rate and eligibility next to the stake action.\n\n- John sets direction and coaches\n- His team designs and ships\n\nAsk about results to see the password step.`;
  ev('message_start', { message: { id: 'msg_dev', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 40, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const piece of text.match(/\S+\s*|\s+/g)) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: piece } });
  ev('content_block_stop', { index: 0 });
  const asks = !unlocked && wantsDetail;
  if (asks) {
    ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_dev', name: 'ask_for_password', input: {} } });
    ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } });
    ev('content_block_stop', { index: 1 });
  }
  ev('message_delta', { delta: { stop_reason: asks ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 60 } });
  ev('message_stop', {});
  const enc = new TextEncoder();
  let i = 0;
  return new Response(new ReadableStream({
    async pull(controller) {
      if (i >= events.length) { controller.close(); return; }
      await new Promise((ok) => setTimeout(ok, i < 2 ? 400 : 35));   // a pause before the first word, then a steady trickle
      controller.enqueue(enc.encode(events[i++]));
    },
  }), { headers: { 'content-type': 'text/event-stream', 'request-id': 'req_dev' } });
}

// ---- Sample history so the tallies have something to show ----
// Sixty-odd sessions over the last week: a visitor reads one to four pages,
// each for a while, with a time beacon every minute and one as they leave.
const PLACES = [
  ['New York', 'NY', 'US', 40.713, -74.006], ['Brooklyn', 'NY', 'US', 40.678, -73.944], ['San Francisco', 'CA', 'US', 37.775, -122.419],
  ['Austin', 'TX', 'US', 30.267, -97.743], ['Chicago', 'IL', 'US', 41.878, -87.630], ['London', 'ENG', 'GB', 51.507, -0.128],
  ['Toronto', 'ON', 'CA', 43.653, -79.383], ['Berlin', 'BE', 'DE', 52.520, 13.405], ['Lisbon', '11', 'PT', 38.722, -9.139], ['Sydney', 'NSW', 'AU', -33.869, 151.209],
];
const PAGES = ['/', '/', '/', '/work.html', '/work.html', '/work/staking.html', '/work/cross-sell.html', '/work/verifications.html', '/work/refinance-offers.html', '/work/no-code-tools.html', '/work/design-system-audit-agent.html'];
const REFS = ['direct', 'direct', 'https://www.linkedin.com/', 'https://www.linkedin.com/feed/', 'https://www.google.com/', 'https://mail.google.com/mail/u/0/',
  'from:slack', 'https://my.greenhouse.io/applications', 'https://app.greenhouse.io/people/12', 'https://boards.greenhouse.io/acme/jobs/4', 'https://app.slack.com/client/T0/C0', 'https://jobs.ashbyhq.com/acme/1a2b', 'https://app.ashbyhq.com/candidates/9'];   // the tag a shared link carries, and the hosts the named sources arrive under
const SPAM = ['https://free-traffic.buttons-for-your-website.com/', 'https://semalt.com/crawler', 'https://a1.semalt.com/', 'https://www.site-audit-ranking.xyz/'];   // referrer spam, to try Block on
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
  // Scanners: the mail filters and crawlers that fetch a shared link from a cloud
  // region and never run the page, so no beacon ever follows. What "Real visits
  // only" is there to hide — leave it on and none of this should show.
  const CLOUD = [['Ashburn', 'VA', 'US', 39.044, -77.487], ['Santa Clara', 'CA', 'US', 37.354, -121.955], ['Boardman', 'OR', 'US', 45.840, -119.688], ['Dublin', 'L', 'IE', 53.344, -6.267]];
  for (let i = 0; i < 55; i++) {
    const p = pick(CLOUD), page = pick(PAGES), t = now - Math.floor(Math.random() * 7 * 86400000);
    const base = { page, where: p.slice(0, 3).join(', '), country: p[2], lat: p[3], lon: p[4], device: pick(['Chrome on Windows', 'Chrome on Linux', 'unknown browser on Linux']), visitor: Math.random().toString(16).slice(2, 8) };
    rows.push({ t, kind: page.startsWith('/work/') ? 'gated' : 'viewed', ref: pick(['direct', 'direct', 'https://www.linkedin.com/']), ...base });
  }
  for (let i = 0; i < 40; i++) {                                                                     // spam: a hit on the home page and nothing else, no beacon
    const p = pick(PLACES), ref = pick(SPAM);
    rows.push({ t: now - Math.floor(Math.random() * 7 * 86400000), kind: 'viewed', ref, page: '/', where: p.slice(0, 3).join(', '), country: p[2], lat: p[3], lon: p[4], device: 'Chrome on Windows', visitor: Math.random().toString(16).slice(2, 8) });
  }
  rows.sort((a, b) => b.t - a.t);
  lists.set('activity', rows.filter((r) => r.t <= now).map((r) => JSON.stringify(r)));
  const names = ['ADA', 'GRACE', 'LINUS', 'MARGARET', 'KEN', 'BARBARA'];
  zsets.set('golf:board', names.map((n, i) => [24 + i * 2 + Math.floor(Math.random() * 2), `${now - i * 3600000}:${n}`]));
  values.set('activity:count', String(rows.filter((r) => r.kind === 'viewed').length + 1840));

  // What people asked the chat, for the dashboard's Questions table.
  const ASKED = [
    ['/', 'What kind of role is John looking for?', 'John is a Director of Product Design looking to build or rebuild a design org. The home page closes on exactly that: [get in touch](/) if you are hiring for one.', false],
    ['/work.html', 'What were the results of the Cross-Sell work?', 'That detail is in the password-protected case study, so it opens once you enter the password.', false],
    ['/work/staking.html', 'How big was the team on Staking?', 'One product designer, across three time zones, with John as Senior Product Design Manager. See [the Staking case study](/work/staking.html).', true],
    ['/', 'How does John run a design team?', 'He sets the strategy and the framework decisions get made against, then spends most of his week on feedback: weekly reviews, structured critique and time with specific people.', false],
    ['/blog.html', 'Has he written about AI hiring?', 'Yes. [Stop hiring for AI fluency](/blog/stop-hiring-for-ai-fluency.html) argues for hiring on judgment over tool fluency.', false],
  ];
  const chats = ASKED.map(([page, q, a, unlocked], i) => {
    const p = pick(PLACES);
    return { t: now - Math.floor((i + Math.random()) * 9 * 3600000), page, q, a, unlocked, asked: !unlocked && /password/.test(a), model: 'claude-haiku-4-5', stop: 'end_turn',
      usage: { in: 40, read: 9800, wrote: 0, out: 70 }, where: p.slice(0, 3).join(', '), country: p[2], device: pick(DEVICES), visitor: Math.random().toString(16).slice(2, 8) };
  });
  lists.set('chat:log', chats.sort((a, b) => b.t - a.t).map((r) => JSON.stringify(r)));
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

// ---- Serve through the middleware, and the chat through its function ----
const { default: middleware, config } = await import('./middleware.js');
const chat = await import('./api/chat.js');
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
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const isChat = url.pathname === '/api/chat';
  const matched = isChat || matchers.some((m) => m.test(url.pathname));
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
  let out;
  if (isChat) {
    const handler = chat[req.method];
    out = handler ? await handler(request) : new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  } else {
    out = await middleware(request, { waitUntil: (pr) => jobs.push(pr) });
  }
  await Promise.all(jobs);
  const identity = who.fresh ? [`dev_id=${who.id}; Path=/; Max-Age=31536000; SameSite=Lax`] : [];
  if (!out) return serveStatic(url.pathname, res, identity);

  const headers = {};
  for (const [k, v] of out.headers) if (k !== 'set-cookie') headers[k] = v;
  const cookies = (out.headers.getSetCookie ? out.headers.getSetCookie() : []).map((c) => c.replace('; Secure', ''));   // plain http locally
  if (cookies.length || identity.length) headers['set-cookie'] = cookies.concat(identity);
  res.writeHead(out.status, headers);
  if (!out.body) { res.end(); return; }
  // Passed on as it arrives, so the chat streams here as it does on Vercel.
  const reader = out.body.getReader();
  res.on('close', () => { if (!res.writableEnded) reader.cancel().catch(() => {}); });
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
  } catch (_) { /* the browser left */ }
  res.end();
});

const port = Number(process.env.PORT) || 4174;
server.listen(port, '127.0.0.1', () => console.log(`edge stand-in on http://127.0.0.1:${port}  (work: ${process.env.CASE_STUDY_PASSWORD} · dashboard: ${process.env.ADMIN_PASSWORD})`));
