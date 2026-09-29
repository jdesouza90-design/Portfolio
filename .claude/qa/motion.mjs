#!/usr/bin/env node
// Motion pass: one page at a time, scrolled like a reader (mouse wheel, 120px every 40ms), with
// requestAnimationFrame wrapped to count callbacks by function. Reports:
//   - blocks the reveal never showed (still transparent or offset after the reader passed them)
//   - animation loops still requesting frames once the page is still (the contact-rings bug)
//   - console and page errors raised while scrolling
//
//   node .claude/qa/motion.mjs [--pages staking] [--widths 1440,390] [--themes light,dark] [--base URL] [--out DIR]
//
// Never run pages in parallel with jump scrolls: that is how the first bug bash produced dozens of
// false "unrevealed blocks". This script runs pages one after another on purpose.
import { args, list, outDir, serve, launch, unlock, open, wheelTo, noise, write, pagesOf } from './lib.mjs';

const a = args();
const dir = outDir(a, 'motion');
const pages = pagesOf(a);
const widths = list(a.widths ?? a.width, ['1440']).map(Number);
const themes = list(a.themes ?? a.theme, ['light']);

const srv = await serve(a);
const browser = await launch(a);
const findings = [];
const counts = {};
try {
  await unlock(browser, srv.base);
  for (const url of pages) for (const width of widths) for (const theme of themes) {
    // Wrap rAF before any site script runs, keyed by the callback's name (or its first 60 characters).
    const init = () => {
      const raf = window.requestAnimationFrame.bind(window);
      window.__raf = {};
      window.requestAnimationFrame = (cb) => {
        const key = cb.name || String(cb).slice(0, 60).replace(/\s+/g, ' ');
        window.__raf[key] = (window.__raf[key] || 0) + 1;
        return raf(cb);
      };
    };
    const { page: p, events } = await open(browser, srv.base, url, { width, height: width < 700 ? 844 : 900, theme, init });
    await new Promise((r) => setTimeout(r, 500));
    const height = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await wheelTo(p, height);
    await new Promise((r) => setTimeout(r, 1500));
    // Blocks the reader has passed that still look unrevealed.
    const hidden = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[class*="reveal"], .rise, [data-reveal], section > *')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > innerHeight || !r.height) continue;       // not passed yet, or empty
        if (el.closest('canvas, [aria-hidden="true"]')) continue;  // live canvases fade out off screen by design
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (Number(cs.opacity) < 0.05) out.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} opacity=${cs.opacity}`);
      }
      return out.slice(0, 12);
    });
    for (const h of hidden) findings.push({ url, width, theme, kind: 'unrevealed', detail: h });
    // Settle, then count frames requested over two still seconds.
    await p.evaluate(() => { window.__raf = {}; });
    await new Promise((r) => setTimeout(r, 2000));
    const idle = await p.evaluate(() => window.__raf);
    counts[`${url} ${width}/${theme}`] = idle;
    for (const [fn, n] of Object.entries(idle)) if (n > 30) findings.push({ url, width, theme, kind: 'busy-while-still', detail: `${fn}: ${n} frames in 2s with nothing moving` });
    for (const c of [...events.console, ...events.pageerrors]) if (!noise(c)) findings.push({ url, width, theme, kind: 'error', detail: c });
    await p.close();
    process.stderr.write(`scrolled ${url} @ ${width}/${theme}\n`);
  }
} finally {
  await browser.close();
  await srv.stop();
}
const file = write(dir, 'report.json', { pages, widths, themes, findings, idleFrames: counts });
console.log(`${findings.length} finding(s). Report: ${file}`);
for (const f of findings) console.log(`- ${f.url} @ ${f.width}/${f.theme} [${f.kind}] ${f.detail}`);
console.log('Note: a busy loop on a page with a live canvas in view (hero dots, strands, Nine holes) can be by design; check README "Motion" before calling it a bug.');
process.exit(findings.length ? 1 : 0);
