// Vercel Edge Middleware — password gate for the case studies.
// Runs before the static files are served. Everything outside /work stays public.

export const config = { matcher: '/work/:path*' };

const COOKIE = 'cs_access';
const MAX_AGE = 60 * 60 * 24 * 30;          // 30 days

async function tokenFor(password) {
  const bytes = new TextEncoder().encode(`cs-gate:v1:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

function page({ path, error, unconfigured }) {
  const msg = unconfigured
    ? '<p class="gate-error" id="gate-error" role="alert">The case-study password isn\'t configured yet. Set CASE_STUDY_PASSWORD in the Vercel project and redeploy.</p>'
    : error
      ? '<p class="gate-error" id="gate-error" role="alert">That password didn\'t match. Check for extra spaces and try again.</p>'
      : '';
  const describe = msg ? ' aria-describedby="gate-error"' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Password required — John DeSouza</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<main class="gate-wrap"><div class="gate">
  <a class="brand" href="/"><span>John DeSouza</span></a>
  <p class="eyebrow">Case studies</p>
  <h1>This case study is password protected.</h1>
  <p class="gate-lede">Enter the password John shared with you. Don't have it yet? <a href="https://www.linkedin.com/in/johndesouza-/" target="_blank" rel="noopener">Message him on LinkedIn</a> and he'll send it over.</p>
  <form method="post" action="${esc(path)}" class="gate-form">
    <label class="sr-only" for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Password"${error ? ' aria-invalid="true"' : ''}${describe}>
    <button class="btn btn-primary" type="submit">Open case study</button>
  </form>${msg}
  <a class="back" href="/work.html">← Back to all work</a>
</div></main>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const password = process.env.CASE_STUDY_PASSWORD;

  if (!password) return new Response(page({ path, unconfigured: true }), { status: 503, headers });
  const expected = await tokenFor(password);

  if (request.method === 'POST') {
    let submitted = '';
    try {
      const form = await request.formData();
      submitted = String(form.get('password') || '').trim();
    } catch (_) {}
    if (submitted === password) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: path,
          'Set-Cookie': `${COOKIE}=${expected}; Path=/work; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return new Response(page({ path, error: true }), { status: 401, headers });
  }

  if (readCookie(request, COOKIE) === expected) return;   // unlocked: serve the page
  return new Response(page({ path }), { status: 401, headers });
}
