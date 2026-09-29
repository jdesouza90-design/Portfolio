#!/usr/bin/env node
// Visual pass: screen-by-screen screenshots of each page, for a reviewer (an agent or John) to look at.
// Full-page screenshots leave lazy images and .emerge screens blank, so this scrolls one screen at a
// time with the wheel, waits, and captures the viewport. A tile that comes back unpainted under load is
// recaptured once before anyone calls it a bug.
//
//   node .claude/qa/shots.mjs [--pages staking] [--widths 1440,390] [--themes light] [--base URL]
//                             [--out DIR] [--select ".hero"] [--max 40]
//
// --select captures just that element (first match) instead of walking the page. Writes PNGs named
// <page>-<width>-<theme>-<nn>.png and an index.json listing them.
import path from 'node:path';
import { args, list, outDir, serve, launch, unlock, open, wheelTo, write, pagesOf } from './lib.mjs';

const a = args();
const dir = outDir(a, 'shots');
const pages = pagesOf(a);
const widths = list(a.widths, ['1440', '390']).map(Number);
const themes = list(a.themes, ['light']);
const max = Number(a.max) || 40;

const blank = async (page) => page.evaluate(() => {
  // A tile is suspicious when an image in view has not decoded.
  return [...document.images].some((i) => { const r = i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.width > 40 && !(i.complete && i.naturalWidth); });
});

const srv = await serve(a);
const browser = await launch(a);
const files = [];
try {
  await unlock(browser, srv.base);
  for (const url of pages) for (const width of widths) for (const theme of themes) {
    const h = width < 700 ? 844 : 900;
    const { page } = await open(browser, srv.base, url, { width, height: h, theme });
    const stem = `${url.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${width}-${theme}`;
    if (a.select) {
      const el = await page.$(a.select);
      if (!el) { console.log(`- ${url}: no element matches ${a.select}`); await page.close(); continue; }
      await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await new Promise((r) => setTimeout(r, 1500));
      const f = path.join(dir, `${stem}-el.png`);
      await el.screenshot({ path: f });
      files.push(f);
    } else {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let i = 0, y = 0; y < total && i < max; i++, y += Math.round(h * 0.9)) {
        await wheelTo(page, y);
        await new Promise((r) => setTimeout(r, 900));
        if (await blank(page)) await new Promise((r) => setTimeout(r, 1500));   // recapture once
        const f = path.join(dir, `${stem}-${String(i).padStart(2, '0')}.png`);
        await page.screenshot({ path: f });
        files.push(f);
      }
    }
    await page.close();
    process.stderr.write(`shot ${url} @ ${width}/${theme}\n`);
  }
} finally {
  await browser.close();
  await srv.stop();
}
write(dir, 'index.json', files);
console.log(`${files.length} screenshot(s) in ${dir}`);
