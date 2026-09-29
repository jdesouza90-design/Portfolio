// Shared helpers for the QA passes. Every trap in the site's QA method (memory: the Sep 28 bug bash)
// is handled here once, so a pass script never rediscovers it:
//   - headless Chrome's own user agent is a bot to middleware.js (the chat answers 403), so local runs
//     use a normal Chrome UA; --prod keeps the bot UA on purpose, so the live smoke test stays out of
//     John's activity feed.
//   - a cross-document view transition covers the page for ~450ms after a same-origin navigation.
//   - html { scroll-behavior: smooth } makes scrollIntoView animate, so scroll with behavior 'instant'.
//   - only a server this process started is ever stopped, by PID.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(QA_DIR, '..', '..');           // the checkout the QA lives in (a worktree, usually)
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const NORMAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const GATE_PASSWORD = 'cs';   // dev.mjs sets CASE_STUDY_PASSWORD ||= 'cs' for the local stand-in; never the live password

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

export const list = (v, dflt) => (v === undefined || v === true ? dflt : String(v).split(',').map((s) => s.trim()).filter(Boolean));

export function outDir(a, name) {
  const dir = a.out ? path.resolve(a.out) : fs.mkdtempSync(path.join(os.tmpdir(), `portfolio-qa-${name}-`));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function freePort(start) {
  for (let p = start; p < start + 60; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error(`no free port from ${start}`);
}

// Start `node dev.mjs` from this checkout on a free port; returns { base, stop }. The edge stand-in
// gives the gates, the chat (scripted) and the dashboard; SEED=0 skips the sample history.
export async function serve(a) {
  if (a.base) return { base: String(a.base).replace(/\/$/, ''), stop: async () => {}, external: true };
  const port = await freePort(Number(a.port) || 4180);
  const child = spawn('node', ['dev.mjs'], { cwd: REPO, env: { ...process.env, PORT: String(port), SEED: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/'); if (r.ok) break; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error('dev.mjs exited:\n' + log);
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    base, pid: child.pid,
    stop: async () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } },   // by the child handle: never a port-based kill
  };
}

export async function launch(a) {
  let puppeteer;
  try { ({ default: puppeteer } = await import('puppeteer-core')); }
  catch { throw new Error('QA tooling not installed in this checkout: run sh .claude/qa/setup.sh'); }
  return puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb'] });
}

// Unlock /work for a browser: post the stand-in password to the gate and hand the cookies to the page.
export async function unlock(browser, base) {
  // Any gated page will do: the cookie covers the whole site. Take the first case study that exists.
  const gated = fs.readdirSync(path.join(REPO, 'work')).find((f) => f.endsWith('.html'));
  const r = await fetch(base + '/work/' + gated, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': NORMAL_UA },
    body: 'password=' + GATE_PASSWORD,
  });
  const cookies = (r.headers.getSetCookie?.() || []).map((c) => {
    const [nv, ...attrs] = c.split(';'); const i = nv.indexOf('=');
    return { name: nv.slice(0, i).trim(), value: nv.slice(i + 1).trim(), url: base, path: '/' };
  }).filter((c) => c.value);
  if (!cookies.length) throw new Error('the gate gave no cookie: is this the dev.mjs stand-in with password "cs"?');
  const p = await browser.newPage();
  await p.setCookie(...cookies);
  await p.close();
  return cookies;
}

// A page in a given state. opts: { width, height, theme: 'light'|'dark', reduced: bool, mobile: bool, prod: bool,
//   init: a function run in the page before any site script (evaluateOnNewDocument) }
export async function open(browser, base, url, opts = {}) {
  const page = await browser.newPage();
  const { width = 1440, height = 900, theme = 'light', reduced = false, mobile = width < 700, prod = false } = opts;
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  if (!prod) await page.setUserAgent(mobile ? MOBILE_UA : NORMAL_UA);
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
  ]);
  if (opts.init) await page.evaluateOnNewDocument(opts.init);
  const events = { console: [], pageerrors: [], failed: [], badStatus: [] };
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) events.console.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => events.pageerrors.push(String(e.message || e)));
  page.on('requestfailed', (r) => events.failed.push(`${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400) events.badStatus.push(`${r.status()} ${r.url()}`); });
  const res = await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 500));   // let the view transition (~450ms) finish before any click
  return { page, events, status: res?.status() };
}

// Scroll like a reader: mouse wheel, 120px every 40ms, so scroll-gated reveals fire as they do for people.
export async function wheelTo(page, y, { step = 120, every = 40 } = {}) {
  await page.mouse.move(200, 300);
  for (let guard = 0; guard < 4000; guard++) {
    const cur = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(cur - y) <= step) break;
    await page.mouse.wheel({ deltaY: y > cur ? step : -step });
    await new Promise((r) => setTimeout(r, every));
  }
}

// Known local-only noise. Vercel's analytics scripts 404 outside production. /api/chat answers 503 when the
// checkout has no node_modules (a fresh worktree): dev.mjs runs with the chat off, which is not a site bug.
// Chrome's "Failed to load resource" console line carries no URL; the request itself is reported with one.
export const noise = (s) => /_vercel\/(insights|speed-insights)|^503 .*\/api\/chat|Failed to load resource/.test(s);

export function write(dir, name, data) {
  const f = path.join(dir, name);
  fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return f;
}

export function pagesOf(a) {
  const glob = (dir) => fs.existsSync(path.join(REPO, dir)) ? fs.readdirSync(path.join(REPO, dir)).filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`) : [];
  const all = ['index.html', 'work.html', ...glob('work'), 'blog.html', ...glob('blog'), '404.html'];
  const given = list(a.pages);
  // A name matches exactly: 'index.html', 'work.html', 'staking' or 'staking.html' (a page's own name), or
  // 'work/' / 'blog/' (a whole directory). No substring matching, so one name never picks up a second page.
  const hit = (p, g) => p === g || (g.endsWith('/') && p.startsWith(g)) || path.basename(p) === g || path.basename(p, '.html') === g;
  const pick = given ? all.filter((p) => given.some((g) => hit(p, g))) : all.filter((p) => !p.startsWith('blog/') || a['all-posts']);
  if (given) for (const g of given) if (!all.some((p) => hit(p, g))) console.error(`no page matches "${g}"`);
  return pick.map((p) => '/' + p.replace(/^index\.html$/, ''));
}
