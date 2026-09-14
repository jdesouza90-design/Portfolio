# John DeSouza — portfolio

A static site (plain HTML, CSS and JavaScript, no build step) generated from the
"Strategic Design & Business Results" slide deck. Hosted on Vercel, deployed from
GitHub.

Live: https://john-desouza.com

## Structure

```
index.html                      Home: hero, selected work, how I lead, how I track design, about, contact
work.html                       Work index: all five case studies
work/cross-sell.html            Best Egg · Cross-Sell (Vehicle Equity & Home Secured Loans)
work/verifications.html         Best Egg · Verifications
work/staking.html               Chainlink Labs · Staking v0.1
work/no-code-tools.html         Auth0 · No-code tools
work/sign-in-with-ethereum.html Auth0 · Sign-in with Ethereum
styles.css                      Tokens, the ten type roles, components, case-study layout
main.js                         CONFIG links, nav, scroll reveal, scroll-spy, chart, walkthroughs
middleware.js                   Vercel Edge Middleware: the password gate for /work/*
vercel.json                     Cache and security headers
assets/                         Mockups, logos, walkthrough recordings exported from the deck
og-image.png                    Social preview image used when the link is shared
```

## Deploying

Push to `main` and Vercel builds and publishes automatically. For a one-off
manual deploy, run `npx vercel --prod` from this folder.

## The case-study password

Everything under `work/` is gated by `middleware.js`, which runs at Vercel's edge
before any file is served. The home page and the work index stay public.

- The password is the `CASE_STUDY_PASSWORD` environment variable, set in
  Vercel → Project → Settings → Environment Variables. It is deliberately not
  stored in this repo.
- A correct password sets a cookie scoped to `/work` that lasts 30 days, so a
  visitor unlocks all five case studies once.
- Changing the password invalidates every existing cookie, because the cookie
  value is derived from the password.
- If the variable is missing the gate fails closed and says so.
- Running `python3 -m http.server` locally has no edge runtime, so the case
  studies open without a password. Use `npx vercel dev` to exercise the gate.

## Before sending the link out

1. **Set your links** at the top of `main.js`:
   ```js
   const CONFIG = {
     linkedin: "https://www.linkedin.com/in/johndesouza-/",
     email: "",     // add your email to show the "Email me" buttons
     resume: "",    // e.g. "assets/john-desouza-resume.pdf" to show "Resume" links
   };
   ```
   Empty values hide their buttons, so nothing looks broken while they're blank.
2. **Check the colleague names.** Team details use first names, roles and
   locations from the deck. Remove anyone who would rather not be listed.

## Type system

Every piece of text on the site takes one of ten roles, defined as tokens at the
top of `styles.css` (`--t-display` … `--t-quote`, with matching `--lh-*` and
`--ls-*`). Nothing sets a font size outside them. The serif speaks (display,
title, heading, quote, stat); the sans does the work (subhead, lede, body,
small, micro).

| Role | Use | Size (phone → desktop) |
|---|---|---|
| Display | The page statement, one per page | 42 → 68 |
| Title | A section's heading | 32 → 46 |
| Heading | A row or panel headline inside a section | 24 → 30 |
| Subhead | A column, card or fact heading | 20 |
| Lede | The paragraph under a display or title | 18 → 21 |
| Body | Running text | 17 |
| Small | Captions, facts, tables, buttons, nav | 15 |
| Micro | Eyebrows and labels, small caps | 12 |
| Stat | A headline number | 44 → 64 |
| Quote | A pull quote | 22 → 28 |

Each role is also a class (`.t-title`, `.t-body` …), and the component rules
assign roles by context, so plain markup gets the right one. Spacing follows
the `--sp-*` scale (4 to 128) and three rhythm tokens: `--section` between
sections, `--row` between rows, `--panel-h` for a visual beside copy.

## Case study skeleton

All five case studies are the same document, in this order:

1. **Hero**: eyebrow, title, one-sentence lede, the project's screens on its
   own tinted panel, then four facts (role, team, timeline, outcome) as icon +
   heading + text columns divided by dashed rules.
2. **Results**: centred title and lede, then the proof (chart, capacity meter,
   A/B table, or quotes where there are no published numbers).
3. **How we got there**: rows that alternate copy and a fixed-height panel
   (`.row`, `.row.flip`), or run full width for flows and walkthroughs
   (`.row.full`). Each row is one eyebrow, one heading, one short paragraph.
4. **My role**: three icon columns (`.cols`).
5. **What I'd do differently**: same three columns, where a retro exists.
6. **Next**: the closing band with the next case study and contact.

Icons are inline SVG, 24-unit, 1.5 stroke, ink with one cobalt detail
(`class="ac"` for an accent stroke, `ac-fill` for a tinted shape).

## Editing content

- Copy follows [VOICE.md](VOICE.md). Read it before writing or rewriting any text on the site.
- Case-study copy lives directly in each `work/*.html` file.
- The originations chart on the Cross-Sell page reads its numbers from the
  `data-series` attribute on the `.chart` element; the table below it is the
  accessible fallback.
- Company logos in `assets/logo-*.svg` are the companies' own vector files. Each
  is sized in `styles.css` so the wordmark text matches across all three, since
  the three lockups have different icon-to-text proportions.
- Each case study has its own background, set by a `case-*` class on `<body>`
  and on its row in the work index.
- The three walkthrough recordings are 2.8–7.8 MB and only load when a visitor
  presses Play. They come from the deck's GIFs, so their resolution is capped;
  replace them if you still have the original screen recordings.
- Image URLs carry a `?v=` content hash. If you replace a file in `assets/`,
  update that hash (or any changed value) so visitors stop seeing the old one.
