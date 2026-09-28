// Prints a Hugeicons icon as the inline SVG the site uses. Every icon on the
// site comes from Hugeicons' free set (stroke rounded, MIT), pinned below.
//
//   node hugeicon.mjs Mail01                      the svg, ready to paste
//   node hugeicon.mjs Key02 --class col-icon --ac 1
//                                                  a decision icon, element 1 in the accent
//   node hugeicon.mjs GridView --ac-fill 3        element 3 as the tinted accent shape
//   node hugeicon.mjs --find chart                names that match, to browse at hugeicons.com
//
// --ac and --ac-fill take the element numbers (from 0) that --parts lists.
// Nothing is installed: the icon is read from jsDelivr, so this needs the network.

const VERSION = "4.3.5";
const CDN = `https://cdn.jsdelivr.net/npm/@hugeicons/core-free-icons@${VERSION}/dist/esm/`;
const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const nums = (flag) => (opt(flag) || "").split(",").filter(Boolean).map(Number);

const get = async (file) => {
  const r = await fetch(CDN + file);
  if (!r.ok) { console.error(`${file}: ${r.status}. Check the name with --find, or at hugeicons.com (without "Icon").`); process.exit(1); }
  return r.text();
};

if (args[0] === "--find") {
  const word = (args[1] || "").toLowerCase();
  const names = [...(await get("index.js")).matchAll(/from '\.\/(\w+)Icon\.js'/g)].map((m) => m[1]);
  console.log([...new Set(names)].filter((n) => n.toLowerCase().includes(word)).join("\n"));
  process.exit(0);
}

const name = (args[0] || "").replace(/Icon$/, "");
if (!name) { console.error("usage: node hugeicon.mjs <Name> [--class c] [--ac 0,2] [--ac-fill 1] [--parts]"); process.exit(1); }

// The module is one array literal of [tag, attributes] pairs; quote its keys and it
// reads as JSON, so nothing fetched is ever run.
const src = await get(`${name}Icon.js`);
const body = src.slice(src.indexOf("["), src.lastIndexOf("]") + 1);
const els = JSON.parse(body.replace(/([{,]\s*)([A-Za-z]\w*):/g, '$1"$2":'));

const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const items = els.map(([tag, a]) => ({ tag, a: Object.fromEntries(Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => [kebab(k), String(v)])) }));

if (args.includes("--parts")) {
  items.forEach(({ tag, a }, i) => console.log(i, tag, (a.d || "").slice(0, 60)));
  process.exit(0);
}

// What every element shares moves up to the <svg>, so the markup stays short.
const root = { viewBox: "0 0 24 24" };
for (const k of ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]) {
  const v = items.map((it) => it.a[k]);
  if (v.every((x) => x !== undefined && x === v[0])) { root[k] = v[0]; items.forEach((it) => delete it.a[k]); }
}
if (!("fill" in root)) root.fill = "none";

const ac = nums("--ac"), acFill = nums("--ac-fill");
const kids = items.map(({ tag, a }, i) => {
  const cls = ac.includes(i) ? ' class="ac"' : acFill.includes(i) ? ' class="ac-fill"' : "";
  const rest = Object.entries(a).sort(([x], [y]) => (x === "d" ? -1 : y === "d" ? 1 : 0)).map(([k, v]) => ` ${k}="${v}"`).join("");
  return `<${tag}${cls}${rest}/>`;
}).join("");
const cls = opt("--class");
const head = (cls ? ` class="${cls}"` : "") +
  ["viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"].filter((k) => k in root).map((k) => ` ${k}="${root[k]}"`).join("");
console.log(`<svg${head} aria-hidden="true" focusable="false">${kids}</svg>`);
