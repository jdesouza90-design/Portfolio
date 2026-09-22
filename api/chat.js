// The site's assistant: answers questions about John's work from the pages
// themselves, with Claude. A Vercel Function (Node.js), kept apart from the
// edge middleware so nothing here can take the password gates down with it.
//
//   GET  /api/chat                    { ready, unlocked, starters }: whether it
//                                     is set up and switched on, whether this
//                                     visitor has unlocked the case studies, and
//                                     the suggested questions to offer and the
//                                     questions a chat may ask (`limit`); for the
//                                     owner, `pages` too: how many it can read
//   POST /api/chat {messages, page}   the answer as a stream, one JSON event a line:
//                                       {t: 'text', v}      a piece of the answer
//                                       {t: 'password'}     the model asked for the case-study password
//                                       {t: 'unlocked'}     the question was the password, and it opened them
//                                       {t: 'error', v}     what went wrong, in words fit for the panel
//                                       {t: 'done'}
//   POST /api/chat {password}         { unlocked } and the unlock cookie, as the gate does
//
// What it knows: the site's own HTML, read from disk (vercel.json bundles the
// pages with the function) and cut down to text once per instance. Everyone
// gets the public pages: home, the work index and the blog. The case studies
// are added only for a visitor holding the unlock cookie (or the owner's), so
// the model never has anything gated to give away to anyone else. A page
// marked noindex is parked and never read.
//
// The settings live on the dashboard (Chat settings, kept in the store by the
// middleware): on or off, the model (Claude Haiku 4.5 by default), questions
// per visitor an hour, questions for the whole site a day (the cost ceiling),
// the suggested questions and John's notes, which join the instructions. The
// instructions and public pages are one cached block and the case studies a
// second, so a conversation pays full price for the pages about once.
//
// What it records: each exchange in the Redis list chat:log, which the
// dashboard shows under Questions (a password is never kept). An unlock in the
// chat, right or wrong, goes to the activity feed and the email, like the gate's.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  COOKIE, MAX_AGE, ADMIN_COOKIE, OWNER_COOKIE, CHAT_KEY, CHAT_KEEP,
  tokenFor, adminTokenFor, cookieValues, readCookie, setCookie,
  redis, logAccess, visitorId, whereFrom, describeUA, isBot, chatSettings,
} from '../middleware.js';

const MAX_TOKENS = 2000;          // an answer is a few sentences; this is room (and Sonnet's thinking), not a target
const KEEP_MESSAGES = 16;         // the tail of a conversation sent with each question
const MAX_QUESTION = 600;         // characters; the composer stops at the same
const MAX_ANSWER = 4000;          // characters of an earlier answer sent back
const TRY_LIMIT = 10;             // passwords a visitor may try in an hour

const CONTACT = {
  email: 'jdesouza90@gmail.com',
  linkedin: 'https://www.linkedin.com/in/johndesouza-/',
  resume: '/assets/john-desouza-resume.pdf',
};


// ---- The pages, as text ----------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', rarr: '→', larr: '←', times: '×', copy: '©' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(n); } catch (_) { return m; }
  });
}
const flat = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// One page's <main> as plain text: headings as #, list items as -, table
// cells split by |, a definition as "term: value", images by their alt text
// and links to the site's own pages as Markdown, so the model can link them.
// Comments go first: a parked row on the work index lives in one.
export function pageText(rel, html) {
  if (!html || /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) return '';
  const url = rel === 'index.html' ? '/' : `/${rel}`;
  const title = flat((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  const description = decode((/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html) || [])[1] || '').trim();
  const main = (/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html) || [])[1] || '';
  const text = main
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|noscript|template|canvas|button|form|nav|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img\b[^>]*?\balt="([^"]+)"[^>]*>/gi, (_, alt) => ` [Image: ${alt}] `)
    .replace(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = flat(inner);
      if (!label) return ' ';
      const h = decode(href);
      if (!h || h.startsWith('#')) return ` ${label} `;           // main.js fills these in (LinkedIn, email, resume), or a jump on the page
      let to = '';
      try {
        const u = new URL(h, `https://site.local${url}`);
        if (u.host === 'site.local' || u.host === 'john-desouza.com') to = u.pathname;
      } catch (_) {}
      if (!to || !/\.html$|\/$/.test(to)) return ` ${label} `;
      return label.length > 80 ? ` ${label} (${to}) ` : `[${label}](${to})`;   // a whole card is a link: its text, then where it goes
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) => `\n\n${'#'.repeat(Number(n))} ${flat(inner)}\n`)
    .replace(/<\/dt>\s*<dd\b[^>]*>/gi, ': ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/?(p|div|section|article|header|footer|aside|figure|figcaption|blockquote|ul|ol|dl|dt|dd|table|thead|tbody|tr|details|summary)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = [];
  for (let line of decode(text).split('\n')) {
    line = line.replace(/\s+/g, ' ').replace(/ ([,.;:!?)])/g, '$1').replace(/\( /g, '(').replace(/\s*\|\s*$/, '').trim();
    if (!line || line === '-') { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); continue; }
    if (line !== lines[lines.length - 1]) lines.push(line);   // a duplicated strip or label says nothing twice
  }
  return `<page url="${url}" title="${title}">\n${description ? `${description}\n\n` : ''}${lines.join('\n').trim()}\n</page>`;
}

// Read once per instance: the pages only change with a deploy, which starts new instances.
let pagesOnce = null;
function sitePages() {
  if (!pagesOnce) {
    const root = process.cwd();
    const read = (rel) => readFile(path.join(root, rel), 'utf8').catch(() => '');
    const list = async (dir) => (await readdir(path.join(root, dir)).catch(() => []))
      .filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`);
    const texts = async (rels) => (await Promise.all(rels.map(async (rel) => pageText(rel, await read(rel))))).filter(Boolean).join('\n\n');
    pagesOnce = (async () => ({
      open: await texts(['index.html', 'work.html', 'blog.html', ...await list('blog')]),
      gated: await texts(await list('work')),
    }))()
      .catch((err) => { pagesOnce = null; throw err; });
  }
  return pagesOnce;
}


// ---- The brief ---------------------------------------------------------------
// The first block is the same for every visitor (instructions, then the
// public pages) and is cached; the case studies follow as a second cached
// block for a visitor who has unlocked them. Anything that changes with the
// request (the page they are on) comes after both, so it never breaks the cache.

const BRIEF = `You are the assistant on John DeSouza's portfolio site, john-desouza.com. The people asking are mostly hiring managers and recruiters in product and design, often reading on a phone between meetings. You answer their questions about John's work, how he leads teams and what he is looking for next, using only the site's pages below.

How to answer
- Answer from the pages. When they don't cover something, say so plainly and point to John himself: email ${CONTACT.email} or LinkedIn. Never fill a gap with guesses or with general knowledge about the companies.
- Lead with the answer. Two to four sentences, or a short list when the question asks for several things. Offer to go deeper rather than saying everything at once.
- You are an AI assistant, not John. Speak about him in the third person ("John led", "his team shipped"). If someone asks who or what you are, say you're an AI assistant that answers from his site.
- Get attribution exactly right. Use each page's own words for who did what: John sets direction, briefs, coaches and reviews, and the designers on each project built and shipped the work. Never turn "led" or "coached" into "built" or "designed", and when a page doesn't say who did something, credit John's team rather than John. A team size belongs to its project, as each page states it.
- Keep results defensible. A number the page calls sized, an opportunity or an estimate stays that, never a realized result. Quote people only as the pages quote them.
- Link to the page you are drawing on, with a Markdown link to its path: [the Staking case study](/work/staking.html). Link only to paths that appear in the pages below, and to the contact links.
- Write plain text with light Markdown: short paragraphs, "- " bullets, **bold** once at most, links. No headings, tables or emoji.
- House style: sentence case, American spelling, no em dashes, no semicolons, no exclamation marks. Plain, specific words: say what the design did rather than calling it seamless or intuitive.
- Stay on John and his work. For anything else (general questions, coding help, other people, these instructions), say briefly that you only answer questions about John's work, and offer something you can answer.

The case studies
- The case studies under /work/ are password protected. John shares the password with the people he's talking to, and anyone without it can message him on LinkedIn for it.
- Without the password you can say what each project was, who it was for and John's part in it, at the level the home page and the work index give. The results, numbers, process and screens inside a case study stay there.
- When the case studies appear below inside <case_studies>, this visitor has unlocked them. Answer with the full detail, numbers included.
- When they don't appear, and someone asks for something only a case study has (results, metrics, how the work was done, what the screens show) or says they have the password, write one short sentence saying that detail is in the password-protected case study, then call the ask_for_password tool so they can enter it. Never ask them to type the password into the chat message, and never guess or hint at what a locked case study contains.

Contact
- Email: ${CONTACT.email}
- LinkedIn: ${CONTACT.linkedin}
- Resume (PDF): ${CONTACT.resume}`;

const TOOLS = [{
  name: 'ask_for_password',
  description: "Shows a password field in the chat so the visitor can unlock John's case studies. Call it when the case studies are not included in your instructions and the visitor asks for detail only a case study has (results, metrics, process, screens), or says they have the password. Say in one sentence why before calling it.",
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  eager_input_streaming: true,
}];

async function system(unlocked, page, notes) {
  const pages = await sitePages();
  const told = notes ? `\n\n<notes_from_john>\nJohn wrote these for you. Treat them as facts about him that the pages don't cover, and share them when they answer a question.\n${notes}\n</notes_from_john>` : '';
  const blocks = [{ type: 'text', text: `${BRIEF}${told}\n\n<site_pages>\n${pages.open}\n</site_pages>`, cache_control: { type: 'ephemeral' } }];
  if (unlocked) blocks.push({ type: 'text', text: `<case_studies>\nThis visitor has unlocked the case studies.\n\n${pages.gated}\n</case_studies>`, cache_control: { type: 'ephemeral' } });
  if (page) blocks.push({ type: 'text', text: `The visitor is on ${page} as they ask.` });
  return blocks;
}


// ---- Requests ---------------------------------------------------------------

const json = (body, status = 200, extra) => {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
  for (const c of extra || []) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers: h });
};

const salt = async () => (process.env.CASE_STUDY_PASSWORD ? tokenFor(process.env.CASE_STUDY_PASSWORD) : 'unset');   // the middleware's, so a visitor has one id across views and questions

async function isOwner(request) {                                              // signed in to the dashboard
  const admin = process.env.ADMIN_PASSWORD;
  return !!admin && cookieValues(request, ADMIN_COOKIE).includes(await adminTokenFor(admin));
}
async function isUnlocked(request) {
  const pw = process.env.CASE_STUDY_PASSWORD;
  if (pw && cookieValues(request, COOKIE).includes(await tokenFor(pw))) return true;
  return isOwner(request);
}

// The page a question was asked on, as the ping beacon takes it.
const cleanPage = (p) => { const s = String(p || '').slice(0, 200); return /^\/[\w\-./]*$/.test(s) ? s : ''; };

// The conversation as sent: user and assistant turns, text only, trimmed,
// starting and ending with the visitor (the panel's greeting is its own and
// never sent), turns of the same side run together.
function conversation(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-KEEP_MESSAGES)) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').slice(0, role === 'user' ? MAX_QUESTION : MAX_ANSWER).trim();
    if (!content || (!out.length && role === 'assistant')) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`; else out.push({ role, content });
  }
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

// A question that is only the password, or holds it as a word of its own.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const holdsPassword = (text, pw) => !!pw && new RegExp(`(^|[\\s"'“‘(\\[:])${escapeRe(pw)}($|[\\s"'”’)\\].,!?:;])`).test(text);

// Counters in Redis (SET NX EX starts the window, INCR counts in it); without
// a store, a count kept by this instance alone.
const local = new Map();
async function count(key, windowSecs) {
  try {
    const out = await redis([['SET', key, 0, 'EX', windowSecs, 'NX'], ['INCR', key]]);
    if (out) return Number(out[1]);
  } catch (err) { console.error('chat: counter failed', err); }
  const now = Date.now(), c = local.get(key);
  if (!c || c.until < now) { local.set(key, { n: 1, until: now + windowSecs * 1000 }); return 1; }
  return ++c.n;
}

// The two cookies an unlock sets: the unlock itself, site-wide so this
// function can read it, and an expired copy at the path it used to live on.
const unlockCookies = (token) => [setCookie(COOKIE, token, '/', MAX_AGE), setCookie(COOKIE, '', '/work', 0)];

async function tryPassword(request, submitted, who) {
  const pw = process.env.CASE_STUDY_PASSWORD;
  if (!pw) return { ok: false, status: 503, error: "The case-study password isn't set up yet." };
  if (await count(`chat:tries:${who.visitor}`, 3600) > TRY_LIMIT) return { ok: false, status: 429, error: 'Too many tries for now. Message John on LinkedIn for the password.' };
  const chatUrl = new URL('/api/chat', request.url);
  if (submitted.trim() === pw) {
    if (!who.muted) await logAccess('unlocked', request, chatUrl, who.salt);
    return { ok: true, cookies: unlockCookies(await tokenFor(pw)) };
  }
  if (!who.muted) await logAccess('wrong password', request, chatUrl, who.salt);
  return { ok: false, status: 401, error: "That password didn't match. Check for extra spaces and try again." };
}

async function logExchange(request, who, entry) {
  if (who.muted) return;
  try {
    const h = request.headers;
    const row = { t: Date.now(), ...entry, where: whereFrom(h), country: h.get('x-vercel-ip-country') || '', device: describeUA(h.get('user-agent') || ''), visitor: who.visitor };
    console.log('chat', JSON.stringify(row));
    await redis([['LPUSH', CHAT_KEY, JSON.stringify(row)], ['LTRIM', CHAT_KEY, 0, CHAT_KEEP - 1]]);
  } catch (err) { console.error('chat: log failed', err); }
}

// Words for the panel when the model can't answer.
function trouble(err) {
  if (err instanceof Anthropic.RateLimitError) return 'A lot of people are asking right now. Try again in a minute.';
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return `The assistant isn't set up right. Email John at ${CONTACT.email} instead.`;
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status >= 500)) return 'The assistant is overloaded. Try again in a minute.';
  return `Something went wrong on my side. Try again, or email John at ${CONTACT.email}.`;
}

let client = null;

export async function GET(request) {
  const settings = await chatSettings();
  const body = { ready: !!process.env.ANTHROPIC_API_KEY && settings.on, unlocked: await isUnlocked(request), starters: settings.starters, caseStarters: settings.caseStarters, postStarters: settings.postStarters, workStarters: settings.workStarters, limit: settings.chatLimit };
  if (await isOwner(request)) {                  // the dashboard's check that the pages came with the function
    const count = (t) => (t.match(/<page url=/g) || []).length;
    try { const p = await sitePages(); body.pages = { open: count(p.open), gated: count(p.gated) }; } catch (_) { body.pages = { open: 0, gated: 0 }; }
  }
  return json(body);
}

export async function POST(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  let sameSite = !origin;
  try { sameSite = sameSite || new URL(origin).host === url.host; } catch (_) {}
  const ua = request.headers.get('user-agent') || '';
  if (!sameSite || isBot(ua)) return json({ error: 'Not allowed' }, 403);
  const settings = await chatSettings();
  if (!process.env.ANTHROPIC_API_KEY || !settings.on) return json({ error: "The assistant is switched off right now." }, 503);

  let body = null;
  try { body = JSON.parse(await request.text()); } catch (_) {}
  if (!body || typeof body !== 'object') return json({ error: 'Bad request' }, 400);

  const s = await salt();
  const who = { salt: s, visitor: await visitorId(request, s), muted: readCookie(request, OWNER_COOKIE) === '1' };

  // The password field in the panel.
  if (typeof body.password === 'string') {
    const r = await tryPassword(request, body.password.slice(0, 200), who);
    return r.ok ? json({ unlocked: true }, 200, r.cookies) : json({ unlocked: false, error: r.error }, r.status);
  }

  const messages = conversation(body.messages);
  if (!messages.length) return json({ error: 'Ask a question first.' }, 400);
  const turns = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.role !== 'assistant').length : 0;
  if (turns > settings.chatLimit) return json({ error: `That's the limit for one chat. Email John at ${CONTACT.email} and he'll take it from here.` }, 429);
  const question = messages[messages.length - 1].content;
  const page = cleanPage(body.page);
  const unlocked = await isUnlocked(request);

  // The reply, as a stream of events. `produce` writes them; if the reader
  // leaves, writing stops and `onLeave` (the model call's abort) runs.
  const enc = new TextEncoder();
  let onLeave = null;
  const stream = (produce) => {
    let open = true;
    return new Response(new ReadableStream({
      async start(controller) {
        const send = (ev) => {
          if (!open) return;
          try { controller.enqueue(enc.encode(`${JSON.stringify(ev)}\n`)); } catch (_) { open = false; }
        };
        try { await produce(send); } catch (err) {
          if (open) { console.error('chat: failed', err); send({ t: 'error', v: trouble(err) }); }
        }
        if (open) { open = false; try { controller.close(); } catch (_) {} }
      },
      cancel() { open = false; if (onLeave) onLeave(); },
    }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  };

  // Typed the password into the question: it opens the case studies here and
  // now, and the words go neither to the model nor to the log.
  if (holdsPassword(question, process.env.CASE_STUDY_PASSWORD)) {
    const r = await tryPassword(request, process.env.CASE_STUDY_PASSWORD, who);
    if (!r.ok) return json({ error: r.error }, r.status);
    const res = stream(async (send) => { send({ t: 'unlocked' }); send({ t: 'done' }); });
    for (const c of r.cookies) res.headers.append('Set-Cookie', c);
    return res;
  }

  if (await count(`chat:hour:${who.visitor}`, 3600) > settings.hourLimit) {
    return stream(async (send) => { send({ t: 'error', v: `That's a lot of questions for one hour. Email John at ${CONTACT.email} and he'll answer the rest himself.` }); send({ t: 'done' }); });
  }
  if (await count(`chat:day:${new Date().toISOString().slice(0, 10)}`, 2 * 86400) > settings.dayLimit) {
    return stream(async (send) => { send({ t: 'error', v: `The assistant has answered all it can for today. Email John at ${CONTACT.email} instead.` }); send({ t: 'done' }); });
  }

  return stream(async (send) => {
    client ||= new Anthropic();
    const params = {
      model: settings.model,
      max_tokens: MAX_TOKENS,
      system: await system(unlocked, page, settings.notes),
      tools: TOOLS,
      messages,
    };
    // Sonnet 5 thinks by default; a short answer from fixed pages needs little of it.
    // (Haiku 4.5 doesn't think unless asked and takes no effort setting.)
    if (settings.model === 'claude-sonnet-5') params.output_config = { effort: 'low' };
    const model = client.messages.stream(params);
    onLeave = () => model.abort();                   // the reader left: stop paying for the rest
    let answer = '', asked = false;
    for await (const ev of model) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        answer += ev.delta.text;
        send({ t: 'text', v: ev.delta.text });
      } else if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use' && ev.content_block.name === 'ask_for_password' && !unlocked && !asked) {
        asked = true;
        send({ t: 'password' });
      }
    }
    const final = await model.finalMessage();
    if (final.stop_reason === 'refusal') {
      const v = "I can't help with that one. Ask me about John's work instead.";
      answer = v; send({ t: 'text', v });
    } else if (final.stop_reason === 'max_tokens') {
      send({ t: 'text', v: '…' });
    }
    send({ t: 'done' });
    const u = final.usage || {};
    await logExchange(request, who, {
      page, q: question, a: answer.slice(0, 4000), unlocked, asked, model: settings.model, stop: final.stop_reason,
      usage: { in: u.input_tokens || 0, read: u.cache_read_input_tokens || 0, wrote: u.cache_creation_input_tokens || 0, out: u.output_tokens || 0 },
    });
  });
}
