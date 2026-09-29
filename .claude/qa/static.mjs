#!/usr/bin/env node
// Static pass: every page at every width and theme, under emulated reduced motion so reveal timing
// can't hide blocks. Reports console errors, failed requests, axe violations (WCAG 2.x A/AA/2.2 +
// best practice), sideways overflow and broken images.
//
//   node .claude/qa/static.mjs [--pages staking,index.html] [--widths 1440,390,320] [--themes light,dark]
//                              [--all-posts] [--base http://127.0.0.1:4174] [--out DIR] [--shots]
//
// Starts its own dev.mjs on a free port unless --base is given, unlocks /work with the stand-in password,
// and writes report.json (+ screenshots with --shots) to --out or a temp dir. Exit 1 on any finding.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { args, list, outDir, serve, launch, unlock, open, noise, write, pagesOf } from './lib.mjs';

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const a = args();
const dir = outDir(a, 'static');
const widths = list(a.widths, ['1440', '390', '320']).map(Number);
const themes = list(a.themes, ['light', 'dark']);
const pages = pagesOf(a);

const srv = await serve(a);
const browser = await launch(a);
const findings = [];
try {
  await unlock(browser, srv.base);
  for (const url of pages) {
    for (const width of widths) {
      for (const theme of themes) {
        const where = { url, width, theme };
        let o;
        try { o = await open(browser, srv.base, url, { width, height: width < 700 ? 844 : 900, theme, reduced: true }); }
        catch (e) { findings.push({ ...where, kind: 'load', detail: String(e.message) }); continue; }
        const { page, events } = o;
        if (o.status >= 400) findings.push({ ...where, kind: 'status', detail: String(o.status) });
        // Walk the page once so lazy images load.
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60)); }
          scrollTo({ top: 0, behavior: 'instant' });
        });
        await new Promise((r) => setTimeout(r, 400));
        const dom = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const over = [];
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width && r.right > vw + 1) {
              // an element inside a sideways scroller (a swipe strip, a table frame) is meant to overflow it
              let p = el.parentElement, clipped = false;
              while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { clipped = true; break; } p = p.parentElement; }
              if (!clipped) over.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} right=${Math.round(r.right)}`);
            }
          }
          const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src'));
          return { scrollW: document.documentElement.scrollWidth, vw, over: over.slice(0, 8), broken };
        });
        if (dom.scrollW > dom.vw + 1) findings.push({ ...where, kind: 'overflow', detail: `scrollWidth ${dom.scrollW} > ${dom.vw}`, elements: dom.over });
        for (const b of dom.broken) findings.push({ ...where, kind: 'broken-image', detail: b });
        await page.addScriptTag({ content: AXE });
        const axe = await page.evaluate(async () => {
          const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
          return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
        });
        for (const v of axe) findings.push({ ...where, kind: 'axe', detail: `${v.id} (${v.impact}): ${v.help}`, nodes: v.nodes });
        for (const c of events.console) if (!noise(c)) findings.push({ ...where, kind: 'console', detail: c });
        for (const e of events.pageerrors) findings.push({ ...where, kind: 'pageerror', detail: e });
        for (const f of [...events.failed, ...events.badStatus]) if (!noise(f)) findings.push({ ...where, kind: 'request', detail: f });
        if (a.shots) await page.screenshot({ path: path.join(dir, `${url.replace(/[^\w]+/g, '_') || 'home'}-${width}-${theme}.png`) });
        await page.close();
      }
    }
    process.stderr.write(`checked ${url}\n`);
  }
} finally {
  await browser.close();
  await srv.stop();
}
// Collapse repeats: the same finding at several widths/themes is one problem.
const grouped = {};
for (const f of findings) {
  const k = `${f.url}|${f.kind}|${f.detail}`;
  (grouped[k] ||= { url: f.url, kind: f.kind, detail: f.detail, nodes: f.nodes || f.elements, at: [] }).at.push(`${f.width}/${f.theme}`);
}
const report = { pages, widths, themes, findings: Object.values(grouped) };
const file = write(dir, 'report.json', report);
console.log(`${report.findings.length} finding(s) across ${pages.length} page(s). Report: ${file}`);
for (const f of report.findings) console.log(`- ${f.url} [${f.kind}] ${f.detail} @ ${f.at.join(', ')}${f.nodes?.length ? '\n    ' + f.nodes.join('\n    ') : ''}`);
process.exit(report.findings.length ? 1 : 0);
