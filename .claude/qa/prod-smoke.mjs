#!/usr/bin/env node
// After a push to main: confirm the deploy is live and the public pages load clean on john-desouza.com.
//
//   node .claude/qa/prod-smoke.mjs [--expect "a string the change put in the page"] [--page /] [--wait 180]
//
// Uses plain headless Chrome on purpose: the middleware logs it as a bot, so the check stays out of
// John's activity feed. Never enters the case-study password; /work pages are checked only for the gate.
// --expect polls the live HTML (not the styles.css stamp, which a change that doesn't touch styles.css
// never moves) until the string appears or --wait seconds pass.
import { args, launch, noise } from './lib.mjs';

const a = args();
const BASE = 'https://john-desouza.com';
const page0 = a.page || '/';
let ok = true;

if (a.expect) {
  const until = Date.now() + (Number(a.wait) || 180) * 1000;
  let seen = false;
  while (Date.now() < until) {
    const html = await (await fetch(BASE + page0 + (page0.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).text();
    if (html.includes(a.expect)) { seen = true; break; }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log(seen ? `live: "${a.expect}" is on ${page0}` : `NOT live after ${a.wait || 180}s: "${a.expect}" missing from ${page0}`);
  ok &&= seen;
}

const browser = await launch(a);
try {
  for (const url of ['/', '/work.html', '/blog.html', '/work/staking.html']) {
    const p = await browser.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message || e)));
    p.on('response', (r) => { if (r.status() >= 400 && !noise(`${r.status()} ${r.url()}`) && !r.url().includes('/work/')) errs.push(`${r.status()} ${r.url()}`); });
    const res = await p.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 45000 });
    const gated = url.startsWith('/work/');
    const status = res?.status();
    const good = gated ? status === 401 || status === 403 || status === 200 : status === 200;
    console.log(`${good && !errs.length ? 'ok ' : 'BAD'} ${url} ${status}${gated ? ' (gate)' : ''}${errs.length ? '\n    ' + errs.join('\n    ') : ''}`);
    ok &&= good && !errs.length;
    await p.close();
  }
} finally { await browser.close(); }
process.exit(ok ? 0 : 1);
