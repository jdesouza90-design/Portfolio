#!/usr/bin/env node
// Draws assets/ai-process.svg, the abstract beside "AI in the process" on the homepage:
// many faint strands (the iterations) resolving into one green line that runs out toward the copy.
// Seeded, so re-running gives the same file. Tune N, yc, xMerge or the ranges, then:
//   node ai-process-art.mjs assets/ai-process.svg && python3 stamp.py
import { writeFileSync } from 'node:fs';

const W = 1000, H = 1000;
let seed = 20260914;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const r = (a, b) => a + (b - a) * rnd();
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

const N = 88;              // strands
const yc = 540;            // where they resolve
const xMerge = 740;        // resolved by here
const step = 30;

const strand = (y0, amp, lam, phi, sway, settle = 0, from = -12, to = W + 12) => {
  const pts = [];
  for (let x = from; x <= to; x += step) {
    const s = smooth((x + 12) / (xMerge + 12));
    const rise = -70 * smooth((x - 560) / 480);
    const base = y0 + (yc + settle - y0) * s + sway * Math.sin(Math.PI * s) + rise;
    const wob = amp * Math.sin(x / lam + phi) * Math.pow(1 - s, 1.3);
    pts.push([x, base + wob]);
  }
  // Catmull-Rom → cubic bezier for smooth strokes with few points
  let d = `M${pts[0][0].toFixed(0)} ${pts[0][1].toFixed(0)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(0)} ${c1[1].toFixed(0)} ${c2[0].toFixed(0)} ${c2[1].toFixed(0)} ${p2[0].toFixed(0)} ${p2[1].toFixed(0)}`;
  }
  return d;
};

let ink = '';
for (let i = 0; i < N; i++) {
  const t = i / (N - 1);
  const y0 = 40 + t * (H - 80) + r(-9, 9);
  const d = strand(y0, r(14, 48), r(120, 260), r(0, Math.PI * 2), r(-70, 70), r(-5, 5), -12, xMerge + 150);
  const w = r(0.7, 1.3).toFixed(2);
  ink += `<path d="${d}" stroke-width="${w}" vector-effect="non-scaling-stroke"/>`;
}
// The resolved line: one strand that keeps going to the edge, drawn last and solid.
const green = strand(yc - 210, 30, 190, 1.2, 40, 0);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4EFE5"/><stop offset="1" stop-color="#E4DAC6"/></linearGradient>
<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${xMerge + 150}" y2="0"><stop offset="0" stop-color="#14100C" stop-opacity=".26"/><stop offset=".6" stop-color="#14100C" stop-opacity=".2"/><stop offset="1" stop-color="#14100C" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<g fill="none" stroke="url(#f)" stroke-linecap="round" vector-effect="non-scaling-stroke">${ink}</g>
<path d="${green}" fill="none" stroke="#3B6B44" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</svg>
`;
writeFileSync(process.argv[2], svg);
console.log('wrote', process.argv[2], (svg.length / 1024).toFixed(0) + 'KB');
