// Password gate for the case studies (/work/*).
// The password lives in the CASE_STUDY_PASSWORD environment variable on Netlify.
// Visitors who enter it get a 30-day cookie scoped to /work; everyone else sees the password page.

const COOKIE = "cs_access";
const MAX_AGE = 60 * 60 * 24 * 30;

const getEnv = (key) => {
  try { if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(key); } catch (_) {}
  try { if (globalThis.Deno?.env?.get) return globalThis.Deno.env.get(key); } catch (_) {}
  return undefined;
};

async function tokenFor(password) {
  const bytes = new TextEncoder().encode(`cs-gate:v1:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page({ path, error, unconfigured }) {
  const message = unconfigured
    ? `<p class="gate-error" role="alert">The case-study password isn't configured yet. Set CASE_STUDY_PASSWORD in Netlify and redeploy.</p>`
    : error
      ? `<p class="gate-error" role="alert">That password didn't match. Check for extra spaces and try again.</p>`
      : "";
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
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500;600&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<main class="gate-wrap">
  <div class="gate">
    <a class="brand" href="/" aria-label="John DeSouza, home"><span>John DeSouza</span></a>
    <p class="eyebrow">Case studies</p>
    <h1>This case study is password protected.</h1>
    <p class="gate-lede">Enter the password John shared with you. Don't have it yet? <a data-link="linkedin" href="#">Message him on LinkedIn</a> and he'll send it over.</p>
    <form method="post" action="${escape(path)}" class="gate-form">
      <label class="sr-only" for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Password" ${error ? 'aria-invalid="true"' : ""}>
      <button class="btn btn-primary" type="submit">Open case study</button>
    </form>
    ${message}
    <a class="back" href="/#work">← Back to all work</a>
  </div>
</main>
<script src="/main.js"></script>
</body>
</html>`;
}

const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const password = getEnv("CASE_STUDY_PASSWORD");

  if (!password) {
    return new Response(page({ path, unconfigured: true }), { status: 503, headers: htmlHeaders });
  }
  const expected = await tokenFor(password);

  if (request.method === "POST") {
    let submitted = "";
    try {
      const form = await request.formData();
      submitted = String(form.get("password") || "").trim();
    } catch (_) {}
    if (submitted === password) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: path,
          "Set-Cookie": `${COOKIE}=${expected}; Path=/work; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(page({ path, error: true }), { status: 401, headers: htmlHeaders });
  }

  if (readCookie(request, COOKIE) === expected) {
    const res = await context.next();
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(res.body, { status: res.status, headers });
  }

  return new Response(page({ path }), { status: 401, headers: htmlHeaders });
};
