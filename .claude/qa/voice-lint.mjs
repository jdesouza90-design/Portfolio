#!/usr/bin/env node
// Voice lint: the mechanical half of VOICE.md, checked on the text a reader sees. Judgment (outcome
// first, a person not a resume, what reads as generated) stays with the copy agent; this catches what
// a regex can, so the agent's attention goes to the rest.
//
//   node .claude/qa/voice-lint.mjs [files...]        default: index.html work.html work/*.html blog/posts/*.html
//   node .claude/qa/voice-lint.mjs --changed          only pages changed on this branch against main
//
// Flags: em dashes and semicolons outside quotes (the <title> separator is allowed), exclamation
// marks outside quotes, banned words, British spellings, "X, not Y" more than once a page, sentences
// over 20 words, and headings over eight words. Exit 1 on errors. Long sentences and headings are
// warnings, counted always and listed with --verbose (the site has many; fix the ones in text you touch).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { args, REPO } from './lib.mjs';

const a = args();
let files = a._;
if (a.changed) {
  const out = execFileSync('git', ['-C', REPO, 'diff', '--name-only', 'main...HEAD'], { encoding: 'utf8' }) +
              execFileSync('git', ['-C', REPO, 'diff', '--name-only'], { encoding: 'utf8' });
  files = [...new Set(out.split('\n'))].filter((f) => /^(index\.html|work\.html|work\/[^/]+\.html|blog\/posts\/[^/]+\.html)$/.test(f));
}
if (!files.length && !a.changed) {
  const dirList = (d) => fs.existsSync(path.join(REPO, d)) ? fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`) : [];
  files = ['index.html', 'work.html', ...dirList('work'), ...dirList('blog/posts')];
}

const BANNED = ['seamless', 'seamlessly', 'intuitive', 'robust', 'game-changing', 'game-changer', 'best-in-class', 'leverage', 'leveraged', 'leveraging',
  'empower', 'empowered', 'empowering', 'facilitated', 'facilitate', 'stakeholders', 'cross-functional partners', 'end users', 'touchpoint', 'touchpoints',
  'cognitive load', 'delivered', 'drove', 'ensured', 'real-time', 'transparent'];
const BRITISH = { colour: 'color', colours: 'colors', favour: 'favor', behaviour: 'behavior', organise: 'organize', organised: 'organized', organising: 'organizing',
  prioritise: 'prioritize', prioritised: 'prioritized', optimise: 'optimize', optimised: 'optimized', recognise: 'recognize', centre: 'center', centred: 'centered',
  analyse: 'analyze', analysed: 'analyzed', licence: 'license', grey: 'gray', programme: 'program', catalogue: 'catalog', travelled: 'traveled', modelling: 'modeling',
  labelled: 'labeled', cancelled: 'canceled', judgement: 'judgment', realise: 'realize', realised: 'realized', minimise: 'minimize', maximise: 'maximize', emphasise: 'emphasize' };

function visibleText(html) {
  let s = html;
  const isPost = /^\s*{/.test(s);                       // blog/posts: JSON front matter, then the body fragment
  if (isPost) s = s.slice(s.indexOf('\n}') + 2);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
       .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
       .replace(/<title>[\s\S]*?<\/title>/i, ' ')        // the one place an em dash is allowed
       .replace(/<head>[\s\S]*?<\/head>/i, ' ');
  // Mark quotes so rules can skip them: blockquote/q contents keep the speaker's grammar and punctuation.
  s = s.replace(/<(blockquote|q)\b[\s\S]*?<\/\1>/gi, (m) => ' \u0001' + m.replace(/<[^>]+>/g, ' ') + '\u0002 ');
  const headings = [...s.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const blocks = s.split(/<\/(?:p|li|h[1-6]|td|th|figcaption|dd|dt|div|span|a|button|label)>/i)
    .map((b) => b.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;|&#\d+;/g, "'").replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { headings, blocks };
}

const unquoted = (t) => t.replace(/\u0001[\s\S]*?\u0002/g, ' ').replace(/[“"][^”"]{3,}[”"]/g, ' ');
let errors = 0, warnings = 0;
for (const f of files) {
  const full = path.join(REPO, f);
  if (!fs.existsSync(full)) continue;
  const { headings, blocks } = visibleText(fs.readFileSync(full, 'utf8'));
  const out = [];
  const E = (msg) => { out.push(`  error  ${msg}`); errors++; };
  const W = (msg) => { if (a.verbose) out.push(`  warn   ${msg}`); warnings++; };
  let notY = 0;
  const seen = new Set();
  for (const raw of blocks) {
    if (seen.has(raw)) continue; seen.add(raw);
    const t = unquoted(raw);
    const clip = raw.length > 90 ? raw.slice(0, 87) + '...' : raw;
    if (/—/.test(t)) E(`em dash: "${clip}"`);
    if (/;\s/.test(t)) E(`semicolon: "${clip}"`);
    if (/[a-z]!(\s|$)/i.test(t)) E(`exclamation mark: "${clip}"`);
    for (const w of BANNED) if (new RegExp(`\\b${w}\\b`, 'i').test(t)) E(`"${w}" (VOICE.md Words): "${clip}"`);
    for (const [uk, us] of Object.entries(BRITISH)) if (new RegExp(`\\b${uk}\\b`, 'i').test(t)) E(`British "${uk}", use "${us}": "${clip}"`);
    if (/\b\w+, not (a |an |the )?\w+/i.test(t)) notY++;
    for (const sentence of t.split(/(?<=[.?])\s+(?=[A-Z])/)) {
      const n = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
      if (n > 20) W(`${n}-word sentence: "${sentence.slice(0, 90)}${sentence.length > 90 ? '...' : ''}"`);
    }
  }
  if (notY > 1) E(`"X, not Y" appears ${notY} times (one per page at most)`);
  for (const h of headings) {
    const n = h.split(/\s+/).filter(Boolean).length;
    if (n > 8) W(`heading over eight words (${n}): "${h}"`);
    if (/[.]$/.test(h)) W(`heading ends in a full stop: "${h}"`);
  }
  if (out.length) console.log(`${f}\n${out.join('\n')}`);
}
console.log(`\n${errors} error(s), ${warnings} warning(s)${warnings && !a.verbose ? ' (--verbose lists them)' : ''} in ${files.length} file(s). Quotes are skipped: they keep the speaker's grammar.`);
process.exit(errors ? 1 : 0);
