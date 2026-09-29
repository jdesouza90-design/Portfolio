#!/usr/bin/env node
// The gate: what "done" means for a branch on this site, in one command. The orchestrator runs it
// before calling any change finished and before preparing a merge. Every step reports; nothing is
// skipped silently.
//
//   node .claude/qa/gate.mjs [--full] [--no-browser] [--base URL]
//
//   1. branch     not on main (Vercel deploys main on every push)
//   2. stamps     python3 stamp.py; any file it rewrites is stale and must be committed
//   3. blog       python3 blog.py --check (the generated blog/ matches blog/posts/)
//   4. wiring     the case-study checker (ring, grounds, images, nav, README count)
//   5. html       html-validate on every page
//   6. voice      voice-lint on the pages this branch changed
//   7. browser    the static pass on the pages this branch changed; every page when styles.css or
//                 main.js changed, or with --full (1440/390/320, light and dark, reduced motion)
//   8. deck       which changed pages the interview decks mirror (a reminder, never a failure)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { args, REPO, QA_DIR } from './lib.mjs';

const a = args();
const results = [];
const run = (name, cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  results.push({ name, ok: r.status === 0, out });
  return r;
};
const git = (...x) => execFileSync('git', ['-C', REPO, ...x], { encoding: 'utf8' }).trim();

// 1. branch
const branch = git('branch', '--show-current');
results.push({ name: 'branch', ok: branch !== 'main', out: branch === 'main' ? 'on main: move this work to a branch before anything else' : `on ${branch}` });

const changed = [...new Set((git('diff', '--name-only', 'main...HEAD') + '\n' + git('diff', '--name-only') + '\n' + git('diff', '--name-only', '--cached') + '\n' +
  git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean))];

// 2. stamps
const before = git('status', '--porcelain');
run('stamps', 'python3', ['stamp.py']);
const after = git('status', '--porcelain');
if (before !== after) {
  const last = results.at(-1);
  last.ok = false;
  last.out += '\nstamp.py rewrote files: the ?v= hashes were stale. Review and commit them:\n' + git('diff', '--stat');
}

// 3. blog
if (fs.existsSync(path.join(REPO, 'blog.py'))) run('blog', 'python3', ['blog.py', '--check']);

// 4. wiring
const check = path.join(REPO, '.claude/skills/add-case-study/scripts/check.py');
if (fs.existsSync(check)) run('wiring', 'python3', [check, '--no-validate']);

// 5. html
const hv = path.join(QA_DIR, 'node_modules/.bin/html-validate');
const htmlPages = ['index.html', 'work.html', 'blog.html', '404.html', ...['admin', 'work', 'blog'].flatMap((d) =>
  fs.existsSync(path.join(REPO, d)) ? fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`) : [])];
run('html', hv, htmlPages);

// 6. voice
const copy = changed.filter((f) => /^(index\.html|work\.html|work\/[^/]+\.html|blog\/posts\/[^/]+\.html)$/.test(f) && fs.existsSync(path.join(REPO, f)));
if (copy.length) run('voice', 'node', [path.join(QA_DIR, 'voice-lint.mjs'), ...copy]);
else results.push({ name: 'voice', ok: true, out: 'no copy pages changed' });

// 7. browser
if (!a['no-browser']) {
  const sitewide = a.full || changed.some((f) => /^(styles\.css|main\.js|middleware\.js)$/.test(f));
  const pages = changed.filter((f) => /^(index\.html|work\.html|blog\.html|404\.html|work\/[^/]+\.html|blog\/[^/]+\.html)$/.test(f));
  if (sitewide || pages.length) {
    const argv = [path.join(QA_DIR, 'static.mjs')];
    if (!sitewide) argv.push('--pages', pages.join(','));
    if (a.base) argv.push('--base', a.base);
    run('browser', 'node', argv);
  } else results.push({ name: 'browser', ok: true, out: 'no rendered page, styles.css or main.js changed' });
}

// 8. deck
const mirrored = changed.filter((f) => /^(index\.html|work\.html|work\/[^/]+\.html)$/.test(f) || /^assets\/(?!blog\/|BE\/)[^/]+\.(webp|png|jpe?g|gif|svg|mp4|webm)$/.test(f));
const deck = mirrored.length
  ? `The decks mirror: ${mirrored.join(', ')}. If a reader would see the change, the deck-sync agent updates the main deck and the Vanta copy before this is done (CLAUDE.md "Deck sync"), or DECK-PENDING.md gets a line. CSS, motion, markup-only and accessibility changes are exempt: say so.`
  : 'No mirrored page changed: the decks need nothing.';

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n' + r.out.split('\n').slice(-40).map((l) => '      ' + l).join('\n')}`);
}
console.log(`INFO  deck  ${deck}`);
console.log(`\n${failed ? `${failed} step(s) failed` : 'Gate passed'} on ${branch} (${changed.length} file(s) changed against main).`);
process.exit(failed ? 1 : 0);
