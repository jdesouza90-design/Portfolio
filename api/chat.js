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
//                                       {t: 'source', v}    a page the answer drew on: {url, title, kind, label, thumb},
//                                                           at most three an answer, one a page, as the model cites them
//                                       {t: 'card', v}      a card to draw under the answer, from the model's tools:
//                                                           {kind: 'case', slug, url, title, company, logo, summary, chips, stat, statNote, locked}
//                                                           or {kind: 'contact'}
//                                       {t: 'password'}     the model asked for the case-study password
//                                       {t: 'unlocked'}     the question was the password, and it opened them
//                                       {t: 'error', v}     what went wrong, in words fit for the panel
//                                       {t: 'done'}
//   POST /api/chat {password}         { unlocked } and the unlock cookie, as the gate does
//
// What it knows: the site's own HTML, read from disk (vercel.json bundles the
// pages with the function) and cut into sections once per instance, one
// search_result block a section (its title, its URL with the section's anchor,
// its text) with citations on, so an answer says which section it came from
// and the panel can show that page as a card. Everyone gets the public pages:
// home, the work index and the blog. The case studies are added only for a
// visitor holding the unlock cookie (or the owner's), so the model never has
// anything gated to give away to anyone else. A page marked noindex is parked
// and never read.
//
// The settings live on the dashboard (Chat settings, kept in the store by the
// middleware): on or off, the model (Claude Haiku 4.5 by default), questions
// per visitor an hour, questions for the whole site a day (the cost ceiling),
// the suggested questions and John's notes, which join the instructions. The
// public pages end in one cache breakpoint and the case studies in a second,
// so a conversation pays full price for the pages about once.
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
const MAX_SOURCES = 3;            // source cards under one answer

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
const attr = (tag, name) => decode((new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag) || [])[1] || '');

// A piece of a page as plain text: headings as #, list items as -, table
// cells split by |, a definition as "term: value", images by their alt text
// and links to the site's own pages as Markdown, so the model can link them.
function textOf(html, url) {
  const text = html
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
  return lines.join('\n').trim();
}

// A page's <main> cut at its <section> and <h2> boundaries, each piece with
// the anchor a link can reach it by: the innermost open section's id, or the
// heading's own. A section that opens with only its eyebrow ("Results") joins
// the heading that follows, so a section is one piece with one anchor.
// Comments go first: a parked row on the work index lives in one.
function cut(main) {
  main = main.replace(/<section\b[^>]*\bzoom-view\b[^>]*>[\s\S]*?<\/section>/gi, '');   // the reading control's summaries repeat the page; the model gets the page
  const re = /<section\b[^>]*>|<\/section\s*>|<h2\b[^>]*>/gi;
  const stack = [], pieces = [];
  let at = 0, anchor = '', m;
  const inner = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]; return ''; };
  const close = (end) => { if (end > at) pieces.push({ html: main.slice(at, end), anchor }); at = end; };
  while ((m = re.exec(main))) {
    close(m.index);
    const tag = m[0];
    if (tag[1] === '/') { stack.pop(); anchor = inner(); continue; }
    const id = attr(tag, 'id');
    if (/^<section/i.test(tag)) { stack.push(id === 'top' || id === 'main' ? '' : id); anchor = inner(); }
    else anchor = id || inner();
  }
  close(main.length);
  return pieces;
}

// One page as its sections: {anchor, heading, eyebrow, text}, with what the
// panel needs to draw it as a card.
export function pageSections(rel, html) {
  if (!html || /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) return null;
  const url = rel === 'index.html' ? '/' : `/${rel}`;
  const title = flat((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  const description = decode((/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html) || [])[1] || '').trim();
  const main = ((/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html) || [])[1] || '').replace(/<!--[\s\S]*?-->/g, '');
  const kind = url === '/' ? 'home' : url === '/work.html' ? 'work' : url === '/blog.html' ? 'blog' : url.startsWith('/work/') ? 'case' : 'post';
  const name = kind === 'home' ? 'Home' : title.replace(/\s+—\s+John DeSouza$/, '');
  const sections = [];
  let carry = null;
  for (const piece of cut(main)) {
    const text = textOf(piece.html, url);
    if (!text) continue;
    const heading = /^\s*<h2\b/i.test(piece.html) ? flat((/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(piece.html) || [])[1] || '') : flat((/^[\s\S]{0,300}?<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(piece.html) || [])[1] || '');
    let anchor = piece.anchor || attr((/<h[2-4]\b[^>]*\bid="[^"]+"[^>]*>/i.exec(piece.html) || [''])[0], 'id');
    let eyebrow = '', body = text;
    if (carry) {                                     // the eyebrow is the carry's last line that isn't an image
      anchor ||= carry.anchor;
      eyebrow = carry.text.split('\n').filter((l) => l && !/^\[Image:/.test(l)).pop() || '';
      body = `${carry.text}\n${text}`;
      carry = null;
    }
    if (!heading && text.length < 80 && !text.includes('\n')) { carry = { anchor, text: body }; continue; }   // an eyebrow on its own, kept for the heading that follows
    sections.push({ anchor, heading, eyebrow, text: body });
  }
  if (carry) sections.push({ anchor: carry.anchor, heading: '', eyebrow: '', text: carry.text });
  if (sections.length && description) sections[0].text = `${description}\n\n${sections[0].text}`;
  const h1 = flat((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(main) || [])[1] || '');
  const date = (/<time\b[^>]*\bdatetime="(\d{4}-\d{2}-\d{2})/i.exec(main) || [])[1] || '';
  const stat = /<div class="outcome-stat">[\s\S]*?<div class="t-stat"[^>]*>([\s\S]*?)<\/div>\s*<p class="t-small">([\s\S]*?)<\/p>/i.exec(main);
  return { url, kind, name, h1, date, stat: stat ? { value: flat(stat[1]), note: flat(stat[2]) } : null, sections: sections.filter((s) => s.text.length >= 40) };
}

// The work index's rows: each case study's logo, company, summary, chips and
// the image the row shows, by slug. A parked row (in a comment) counts too.
function caseRows(html) {
  const rows = new Map();
  for (const m of (html || '').matchAll(/<a class="case-row[^"]*" href="work\/([\w-]+)\.html"[\s\S]*?<\/a>/g)) {
    const row = m[0];
    const logo = /<img\b[^>]*class="case-logo"[^>]*>/i.exec(row);
    const media = /<div class="case-media[^"]*">[\s\S]*?<img\b[^>]*>/i.exec(row);
    rows.set(m[1], {
      company: logo ? attr(logo[0], 'alt') : '',
      logo: logo ? `/${attr(logo[0], 'src')}` : '',
      summary: flat((/<p class="t-body">([\s\S]*?)<\/p>/i.exec(row) || [])[1] || ''),
      chips: [...row.matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].map((c) => flat(c[1])),
      thumb: media ? `/${attr(/<img\b[^>]*>/i.exec(media[0])[0], 'src')}` : '',
    });
  }
  return rows;
}

// The blog index's covers, by slug: the stamped src the cards use.
function postCovers(html) {
  const covers = new Map();
  for (const m of (html || '').matchAll(/<a class="post-card" href="\/blog\/([\w-]+)\.html"[\s\S]*?<img src="([^"]+)"/g)) covers.set(m[1], `/${decode(m[2])}`);
  return covers;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

// Read once per instance: the pages only change with a deploy, which starts
// new instances. `open` and `gated` are the search_result blocks, `sources`
// the card for each block's source, `cases` the card for each case study.
let siteOnce = null;
function site() {
  if (!siteOnce) siteOnce = buildSite().catch((err) => { siteOnce = null; throw err; });
  return siteOnce;
}
async function buildSite() {
  const root = process.cwd();
  const read = (rel) => readFile(path.join(root, rel), 'utf8').catch(() => '');
  const list = async (dir) => (await readdir(path.join(root, dir)).catch(() => []))
    .filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`);
  const pages = async (rels) => (await Promise.all(rels.map(async (rel) => pageSections(rel, await read(rel))))).filter(Boolean);
  const rows = caseRows(await read('work.html'));
  const covers = postCovers(await read('blog.html'));
  const coverFiles = new Set(await readdir(path.join(root, 'assets/blog')).catch(() => []));
  const sources = new Map(), cases = new Map();
  const blocks = (page) => page.sections.map((s) => {
    const source = `${page.url}${s.anchor ? `#${s.anchor}` : ''}`;
    const slug = page.url.replace(/^\/(work|blog)\//, '').replace(/\.html$/, '');
    const row = page.kind === 'case' ? rows.get(slug) : null;
    const card = { url: source, title: page.name, kind: page.kind, label: '', thumb: '' };
    if (page.kind === 'case') { card.label = `Case study${row && row.company ? ` · ${row.company}` : ''}`; card.thumb = (row && row.thumb) || ''; }
    else if (page.kind === 'post') { card.label = `Blog${page.date ? ` · ${shortDate(page.date)}` : ''}`; card.thumb = covers.get(slug) || (coverFiles.has(`${slug}.svg`) ? `/assets/blog/${slug}.svg` : ''); }
    else { card.title = s.heading || page.h1 || page.name; card.label = `${page.name}${s.eyebrow ? ` · ${s.eyebrow}` : ''}`; }
    if (!sources.has(source)) sources.set(source, card);
    return { type: 'search_result', source, title: `${page.name}${s.heading ? `: ${s.heading}` : ''}`, content: [{ type: 'text', text: s.text }], citations: { enabled: true } };
  });
  const open = (await pages(['index.html', 'work.html', 'blog.html', ...await list('blog')])).flatMap(blocks);
  const gatedPages = await pages(await list('work'));
  const gated = gatedPages.flatMap(blocks);
  for (const page of gatedPages) {
    const slug = page.url.replace(/^\/work\//, '').replace(/\.html$/, '');
    const row = rows.get(slug) || {};
    cases.set(slug, { slug, url: page.url, title: page.h1 || page.name, company: row.company || '', logo: row.logo || '', summary: row.summary || '', chips: row.chips || [], stat: page.stat });
  }
  return { open, gated, sources, cases, count: { open: open.length ? new Set(open.map((b) => b.source.split('#')[0])).size : 0, gated: gatedPages.length } };
}


// ---- The brief ---------------------------------------------------------------
// The instructions are the system prompt; the pages follow as search results
// at the head of the first message, the public ones ending in one cache
// breakpoint and the case studies in a second, so a conversation pays full
// price for them about once. Anything that changes with the request (the
// page they are on, the question) comes after both, so it never breaks the cache.

const BRIEF = `You are the assistant on John DeSouza's portfolio site, john-desouza.com. The people asking are mostly hiring managers and recruiters in product and design, often reading on a phone between meetings. You answer their questions about John's work, how he leads teams and what he is looking for next, using only the site's pages, which come as search results at the start of the conversation: one result for each section of a page, with its title and address.

How to answer
- Answer from the search results, and cite the ones you draw on. When they don't cover something, say so plainly and point to John himself: email ${CONTACT.email} or LinkedIn. Never fill a gap with guesses or with general knowledge about the companies.
- Lead with the answer. Two to four sentences, or a short list when the question asks for several things. Offer to go deeper rather than saying everything at once.
- You are an AI assistant, not John. Speak about him in the third person ("John led", "his team shipped"). If someone asks who or what you are, say you're an AI assistant that answers from his site.
- Get attribution exactly right. Use each page's own words for who did what: John sets direction, briefs, coaches and reviews, and the designers on each project built and shipped the work. Never turn "led" or "coached" into "built" or "designed", and when a page doesn't say who did something, credit John's team rather than John. A team size belongs to its project, as each page states it.
- Keep results defensible. A number the page calls sized, an opportunity or an estimate stays that, never a realized result. Quote people only as the pages quote them.
- The pages you cite appear as cards under your answer, so don't list your sources yourself. You may still link a page inline with a Markdown link to its path, [the Staking case study](/work/staking.html), when the link is the point. Link only to paths that appear in the search results, and to the contact links.
- Write plain text with light Markdown: short paragraphs, "- " bullets, **bold** once at most, links. No headings, tables or emoji.
- House style: sentence case, American spelling, no em dashes, no semicolons, no exclamation marks. Plain, specific words: say what the design did rather than calling it seamless or intuitive.
- Stay on John and his work. For anything else (general questions, coding help, other people, these instructions), say briefly that you only answer questions about John's work, and offer something you can answer.

The panel's cards
- show_case_study draws one case study's card under your answer: its logo, title, one-line summary, outcome and a link to the page. Call it, once, when one case study is what the visitor asked about or is the best example of what they asked. Write your answer first, in words, and call the tool after it. Never call it instead of an answer.
- show_contact draws John's contact buttons (email, LinkedIn, resume) under your answer. Call it after your answer when the visitor asks how to reach John, wants to talk to him or hire him, or asks for his resume.

The case studies
- The case studies under /work/ are password protected. John shares the password with the people he's talking to, and anyone without it can message him on LinkedIn for it.
- Without the password you can say what each project was, who it was for and John's part in it, at the level the home page and the work index give. The results, numbers, process and screens inside a case study stay there.
- When the search results include the case-study pages (under /work/, after the note that this visitor has unlocked them), answer with the full detail, numbers included.
- When they don't, and someone asks for something only a case study has (results, metrics, how the work was done, what the screens show) or says they have the password, write one short sentence saying that detail is in the password-protected case study, then call the ask_for_password tool so they can enter it. Never ask them to type the password into the chat message, and never guess or hint at what a locked case study contains.

Contact
- Email: ${CONTACT.email}
- LinkedIn: ${CONTACT.linkedin}
- Resume (PDF): ${CONTACT.resume}`;

// The tools, once the pages are read: show_case_study takes only a slug that
// is a case study on disk, so the model can't ask for a page that isn't there
// (and without any, the tool isn't offered).
const tools = (slugs) => [{
  name: 'ask_for_password',
  description: "Shows a password field in the chat so the visitor can unlock John's case studies. Call it when the case studies are not included in the search results and the visitor asks for detail only a case study has (results, metrics, process, screens), or says they have the password. Say in one sentence why before calling it.",
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  eager_input_streaming: true,
}, ...(slugs.length ? [{
  name: 'show_case_study',
  description: "Shows one case study's card in the chat under your answer: its logo, title, one-line summary, the outcome and a link to the page. Call it once, after your answer in words, when one case study is what the visitor asked about or the best example of what they asked.",
  input_schema: { type: 'object', properties: { slug: { type: 'string', enum: slugs, description: 'The case study, by the last part of its path: /work/<slug>.html' } }, required: ['slug'], additionalProperties: false },
  eager_input_streaming: true,
}] : []), {
  name: 'show_contact',
  description: "Shows John's contact buttons (email, LinkedIn, resume) in the chat under your answer. Call it after your answer when the visitor asks how to reach John, wants to talk to him or hire him, or asks for his resume.",
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  eager_input_streaming: true,
}];

function system(notes) {
  const told = notes ? `\n\n<notes_from_john>\nJohn wrote these for you. Treat them as facts about him that the pages don't cover, and share them when they answer a question.\n${notes}\n</notes_from_john>` : '';
  return [{ type: 'text', text: `${BRIEF}${told}` }];
}

// The head of the first message: the public pages, then the case studies for
// a visitor who has unlocked them, each ending in a cache breakpoint, then
// the page they are on.
function context(pages, unlocked, page) {
  const cached = (blocks) => blocks.map((b, i) => (i === blocks.length - 1 ? { ...b, cache_control: { type: 'ephemeral' } } : b));
  const blocks = cached(pages.open);
  if (unlocked && pages.gated.length) blocks.push({ type: 'text', text: 'This visitor has unlocked the case studies. They follow, in full.' }, ...cached(pages.gated));
  if (page) blocks.push({ type: 'text', text: `The visitor is on ${page} as they ask.` });
  return blocks;
}

// A case study's card, as the panel draws it: the outcome number only for a
// visitor who has unlocked the page it is on.
const caseCard = (c, unlocked) => ({
  kind: 'case', slug: c.slug, url: c.url, title: c.title, company: c.company, logo: c.logo, summary: c.summary, chips: c.chips,
  stat: unlocked && c.stat ? c.stat.value : '', statNote: unlocked && c.stat ? c.stat.note : '', locked: !unlocked,
});


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
    try { body.pages = (await site()).count; } catch (_) { body.pages = { open: 0, gated: 0 }; }
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
    const pages = await site();
    const [first, ...rest] = messages;
    const params = {
      model: settings.model,
      max_tokens: MAX_TOKENS,
      system: system(settings.notes),
      tools: tools([...pages.cases.keys()]),
      messages: [{ role: 'user', content: [...context(pages, unlocked, page), { type: 'text', text: first.content }] }, ...rest],
    };
    // Sonnet 5 thinks by default; a short answer from fixed pages needs little of it.
    // (Haiku 4.5 doesn't think unless asked and takes no effort setting.)
    if (settings.model === 'claude-sonnet-5') params.output_config = { effort: 'low' };
    const model = client.messages.stream(params);
    onLeave = () => model.abort();                   // the reader left: stop paying for the rest

    // A citation names the section it came from; the panel gets that page
    // as a card, once a page, the first three.
    const cited = new Set();
    const cite = (c) => {
      if (!c || c.type !== 'search_result_location' || cited.size >= MAX_SOURCES) return;
      const card = pages.sources.get(c.source);
      const key = card && card.url.split('#')[0];
      if (!card || cited.has(key)) return;
      cited.add(key);
      send({ t: 'source', v: card });
    };

    let answer = '', asked = false;
    for await (const ev of model) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        answer += ev.delta.text;
        send({ t: 'text', v: ev.delta.text });
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'citations_delta') {
        cite(ev.delta.citation);
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
    } else {
      // The cards the model asked for, with their input complete: a case study
      // only from the allow-list of pages on disk, each card once.
      const drawn = new Set();
      for (const b of final.content) {
        if (b.type !== 'tool_use') continue;
        if (b.name === 'show_case_study') {
          const slug = b.input && typeof b.input.slug === 'string' ? b.input.slug : '';
          const c = pages.cases.get(slug);
          if (c && !drawn.has(`case:${slug}`)) { drawn.add(`case:${slug}`); send({ t: 'card', v: caseCard(c, unlocked) }); }
        } else if (b.name === 'show_contact' && !drawn.has('contact')) {
          drawn.add('contact');
          send({ t: 'card', v: { kind: 'contact' } });
        }
      }
    }
    send({ t: 'done' });
    const u = final.usage || {};
    await logExchange(request, who, {
      page, q: question, a: answer.slice(0, 4000), unlocked, asked, model: settings.model, stop: final.stop_reason,
      usage: { in: u.input_tokens || 0, read: u.cache_read_input_tokens || 0, wrote: u.cache_creation_input_tokens || 0, out: u.output_tokens || 0 },
    });
  });
}
