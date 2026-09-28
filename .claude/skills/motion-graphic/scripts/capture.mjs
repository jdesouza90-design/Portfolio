#!/usr/bin/env node
// Frame capture for motion pieces, with nothing to install: Node 22's own fetch and
// WebSocket drive a headless Chrome over the DevTools protocol.
//
//   capture.mjs frames <scene.html> <out-dir>   [--fps N] [--from S] [--to S] [--scale N] [--dark] [--reduced]
//   capture.mjs stills <scene.html> <sheet.png> [--at 0,0.8,2.4] [--scale N] [--cols N]
//   capture.mjs page   <url>        <out-dir>   [--at 0,120,300,700] [--rate 0.1] [--scroll SEL | --click SEL | --hover SEL]
//                                               [--width 1440] [--height 900] [--scale N] [--dark] [--reduced] [--sheet]
//
// frames  renders a scene built on assets/scene.template.html one frame at a time: it calls
//         window.__motion.seek(t) for t = from, from + 1/fps, ... and screenshots each, so the
//         output never depends on how fast the machine is. PNGs land as 00000.png, 00001.png...
// stills  renders the same scene at a few times (default: its beats) and lays them out on one
//         contact sheet with the time and the beat's label under each. This is the storyboard.
// page    watches real site motion: loads a page (the dev server, python3 -m http.server 4173),
//         slows every CSS animation and transition to --rate, does one thing (scroll a block
//         into view, click, hover) and screenshots at --at milliseconds of page time after it.
//         Canvas drawn from requestAnimationFrame is not slowed, only the CSS.
//
// Chrome: $CHROME, else Google Chrome or Chromium in /Applications, else Playwright's
// Chromium under /opt/pw-browsers, else google-chrome/chromium on PATH.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [mode, src, out, ...rest] = process.argv.slice(2);
if (!["frames", "stills", "page"].includes(mode) || !src || !out) {
  console.error("usage: capture.mjs frames|stills|page <scene.html|url> <out> [options]  (see the header of this file)");
  process.exit(2);
}
const opt = {};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i].replace(/^--/, "");
  if (rest[i + 1] === undefined || rest[i + 1].startsWith("--")) opt[k] = true;
  else opt[k] = rest[++i];
}
const num = (k, d) => (opt[k] === undefined ? d : Number(opt[k]));
const list = (k) => (typeof opt[k] === "string" ? opt[k].split(",").map(Number) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ];
  for (const p of mac) if (existsSync(p)) return p;
  const pw = "/opt/pw-browsers";
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) if (existsSync(join(pw, d, sub))) return join(pw, d, sub);
    }
  }
  for (const n of ["google-chrome", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [n]).toString().trim(); } catch {}
  }
  throw new Error("No Chrome found. Set CHROME to its executable.");
}

// ---- A small DevTools client: one browser socket, one page session ----
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "motion-chrome-"));
  const args = [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    "--allow-file-access-from-files", "--force-color-profile=srgb", "--font-render-hinting=none",
    "about:blank",
  ];
  if (process.getuid?.() === 0) args.unshift("--no-sandbox");
  const proc = spawn(findChrome(), args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("Chrome did not start:\n" + buf)), 20000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    proc.on("exit", (c) => rej(new Error(`Chrome exited (${c}):\n${buf}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej, method } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result);
    } else if (m.method) {
      for (const w of [...waiters]) if (w.method === m.method && (!w.session || w.session === m.sessionId)) {
        waiters.splice(waiters.indexOf(w), 1); w.res(m.params);
      }
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { res, rej, method });
    ws.send(JSON.stringify(msg));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = {
    send: (m, p) => send(m, p, sessionId),
    once: (method, ms = 30000) => new Promise((res, rej) => {
      const timer = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error(`timed out waiting for ${method}`)); } }, ms);
      const w = { method, session: sessionId, res: (v) => { clearTimeout(timer); res(v); } };
      waiters.push(w);
    }),
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) {
      const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
      writeFileSync(file, Buffer.from(data, "base64"));
    },
  };
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  const close = () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300); };
  return { page, close };
}

async function media(page) {
  const features = [];
  if (opt.dark) features.push({ name: "prefers-color-scheme", value: "dark" });
  if (opt.reduced) features.push({ name: "prefers-reduced-motion", value: "reduce" });
  if (features.length) await page.send("Emulation.setEmulatedMedia", { features });
}

async function go(page, url) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url });
  await loaded;
  await page.eval("document.fonts.ready.then(() => true)");
}

const sceneUrl = (p) => { const u = pathToFileURL(resolve(p)); u.searchParams.set("capture", ""); return u.href; };
const metrics = (page, w, h, scale) => page.send("Emulation.setDeviceMetricsOverride", { width: Math.round(w), height: Math.round(h), deviceScaleFactor: scale, mobile: false });

async function openScene(page) {
  const scale = num("scale", 1);
  await metrics(page, 1080, 1080, scale);
  await media(page);
  await go(page, sceneUrl(src));
  const info = await page.eval(`(async () => {
    const m = window.__motion;
    if (!m) throw new Error("no window.__motion: build the scene on assets/scene.template.html");
    const missing = (await m.ready) || [];
    return { width: m.width, height: m.height, duration: m.duration, fps: m.fps, beats: m.beats || [], missing };
  })()`);
  if (info.missing.length) console.warn(`warning: fonts did not load (${info.missing.join("; ")}); frames will use fallbacks. Is the network up?`);
  await metrics(page, info.width, info.height, scale);
  await page.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  return { ...info, scale };
}

// Lay a set of PNGs out on one sheet, captioned, and screenshot the whole thing.
async function sheet(page, items, file, cols, cellW) {
  const dir = mkdtempSync(join(tmpdir(), "motion-sheet-"));
  const figs = items.map((it, i) => {
    const f = join(dir, `${i}.png`);
    writeFileSync(f, it.png);
    return `<figure><img src="${pathToFileURL(f).href}"><figcaption><b>${it.time}</b>${it.label ? " · " + it.label.replace(/</g, "&lt;") : ""}</figcaption></figure>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#E6E2DA;font:500 13px/1.4 ui-monospace,Menlo,monospace;color:#14100C}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:20px}
    figure{margin:0} img{display:block;width:100%;height:auto;box-shadow:0 0 0 1px rgba(20,16,12,.15)}
    figcaption{margin-top:8px} b{font-weight:500;color:#3B6B44}
  </style><div class="g">${figs}</div>`;
  const htmlFile = join(dir, "sheet.html");
  writeFileSync(htmlFile, html);
  const width = 48 + cols * cellW + (cols - 1) * 20;
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await metrics(page, width, 400, 1);
  await go(page, pathToFileURL(htmlFile).href);
  const height = await page.eval("Math.ceil(document.documentElement.scrollHeight)");
  await metrics(page, width, height, 1);
  await page.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  await page.shot(file);
  rmSync(dir, { recursive: true, force: true });
}

const { page, close } = await launch();
try {
  if (mode === "frames") {
    const s = await openScene(page);
    const fps = num("fps", s.fps || 30), from = num("from", 0), to = num("to", s.duration);
    const n = Math.round((to - from) * fps);
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(out)) if (/^\d{5}\.png$/.test(f)) rmSync(join(out, f));
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      await page.eval(`window.__motion.seek(${from + i / fps})`);
      await page.shot(join(out, String(i).padStart(5, "0") + ".png"));
      if (i % 30 === 29) process.stdout.write(`\r${i + 1}/${n} frames`);
    }
    console.log(`\r${n} frames, ${s.width * s.scale}x${s.height * s.scale} at ${fps} fps (${from}s to ${to}s) in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
  } else if (mode === "stills") {
    const s = await openScene(page);
    const at = list("at") || (s.beats.length ? s.beats.map((b) => b.t) : [0, s.duration / 3, (2 * s.duration) / 3, s.duration - 1 / (s.fps || 30)]);
    const items = [];
    for (const t of at) {
      await page.eval(`window.__motion.seek(${t})`);
      const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const beat = s.beats.find((b) => Math.abs(b.t - t) < 1e-6);
      items.push({ png: Buffer.from(data, "base64"), time: `${t.toFixed(2)}s`, label: beat?.label });
    }
    const cols = num("cols", Math.min(4, items.length));
    const cellW = Math.round(Math.min(360, 1440 / cols));
    await sheet(page, items, out, cols, cellW);
    console.log(`${items.length} stills at ${at.map((t) => t + "s").join(", ")} -> ${out}`);
  } else {
    const W = num("width", 1440), H = num("height", 900), scale = num("scale", 1), rate = num("rate", 0.1);
    const at = list("at") || [0, 100, 200, 300, 500, 700, 1000];
    await metrics(page, W, H, scale);
    await media(page);
    await page.send("Animation.enable");
    await page.send("Animation.setPlaybackRate", { playbackRate: rate });
    await go(page, src);
    await page.send("Animation.setPlaybackRate", { playbackRate: rate });
    await sleep(300);
    const sel = opt.scroll || opt.click || opt.hover;
    if (sel) {
      const box = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) throw new Error("no element matches " + ${JSON.stringify(sel)});
        ${opt.scroll ? "window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * .5, behavior: 'instant' });" : ""}
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (opt.hover) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      if (opt.click) {
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
    }
    const t0 = performance.now();
    mkdirSync(out, { recursive: true });
    const items = [];
    for (const ms of at) {
      const wait = t0 + ms / rate - performance.now();
      if (wait > 0) await sleep(wait);
      const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const png = Buffer.from(data, "base64");
      writeFileSync(join(out, `at-${String(ms).padStart(5, "0")}ms.png`), png);
      items.push({ png, time: `${ms}ms` });
    }
    if (opt.sheet) await sheet(page, items, join(out, "sheet.png"), Math.min(4, items.length), Math.round(Math.min(360, 1440 / Math.min(4, items.length))));
    console.log(`${items.length} shots at ${at.join(", ")}ms of page time (rate ${rate}) -> ${out}`);
  }
} finally {
  close();
}
