#!/usr/bin/env node
// Pull the live activity feed (views, sessions, chat questions) to a private
// file for the analytics-reader agent. John runs this himself: it asks for the
// dashboard password with the input hidden, signs in at /admin/ the way the
// browser does, reads GET /api/activity and writes the JSON outside the repo,
// to ~/.cache/portfolio-activity/activity-<date>.json. The password and the
// admin cookie are never printed or saved.
//
//   node .claude/qa/activity-pull.mjs [--base https://john-desouza.com]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const i = process.argv.indexOf('--base');
const base = (i > -1 ? process.argv[i + 1] : 'https://john-desouza.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };   // echo the prompt, not the keys
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
  });
}

const password = process.env.ADMIN_PASSWORD || await askHidden('Dashboard password: ');
const signIn = await fetch(base + '/admin/', {
  method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
  body: new URLSearchParams({ password }),
});
const cookie = (signIn.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => c.split('=')[1]).join('; ');
if (signIn.status !== 303 || !cookie) { console.error(`Sign-in failed (${signIn.status}). Check the password.`); process.exit(1); }

const res = await fetch(base + '/api/activity', { headers: { cookie, 'user-agent': UA }, cache: 'no-store' });
if (!res.ok) { console.error(`/api/activity answered ${res.status}`); process.exit(1); }
const data = await res.json();

const dir = path.join(os.homedir(), '.cache', 'portfolio-activity');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `activity-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify({ pulled: new Date().toISOString(), base, ...data }, null, 2), { mode: 0o600 });
console.log(`${(data.events || []).length} events, ${(data.chats || []).length} chats → ${file}`);
