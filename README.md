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

1. **Hero**: eyebrow, title and one-sentence lede with the outcome stat beside
   them, the project's screens on its own tinted panel, then four facts
   (role, team, timeline, launch) as a `.facts` stat strip: a small label
   above the value at heading size, cells divided by hairlines.
2. **Results**: centred title and lede, then one `.proof` frame: the headline
   stat top-left, a label top-right, and under it the evidence (chart,
   capacity meter, A/B table, or a hairline list of what shipped where there
   are no published numbers).
3. **My role**: hairline ledger rows (`.ledger`), heading left and paragraph
   right, so a hiring manager reads the leadership story before the work.
4. **How we got there**, always in this order: the problem (copy with a
   tensions list beside an illustration or the old screen), the design (a
   `.row.full` with one framed panel or walkthrough under centred copy), any
   supporting rows (`.row.flip`), then the quotes last (`.row.full.start`
   with an intro line saying where they came from). Each row is one eyebrow,
   one heading, one short paragraph.
5. **What I'd do differently**: one narrow note with run-in labels, where a
   retro exists.
6. **Next**: the closing band with the next case study and contact.

Icons are inline SVG, 24-unit, 1.5 stroke, ink with one green accent detail
(`class="ac"` for an accent stroke, `ac-fill` for a tinted shape).

### On a phone

Section 11 of `styles.css` is the phone layer (560px and under, a few rules
at 640 and 760). The grids above it collapse to one column on their own; the
phone layer fixes what a collapse alone gets wrong:

- Section openers and case-study heroes are left-aligned; the homepage hero
  stays centred.
- Sequences keep their order: the before/after flow, the gallery and a
  three-screen hero become swipe strips (`overflow-x: auto` with scroll snap),
  one screen at a time with the next peeking in. `main.js` gives a strip a
  tab stop only while it actually overflows.
- Story panels take the height of their screen instead of a landscape box;
  cropped desktop screens keep the 4:3 box.
- The A/B table stacks into one card per metric, each cell labelled by its
  column through `data-label` on the `<td>`.
- The bar chart draws a 360-wide variant with short month labels, since the
  720-wide drawing scaled its type to 5px.
- The facts strip loses its box and tightens to label-over-value rows; the
  tab strip scrolls; the testimonial quote steps down to quote size and the
  product mark drops under the name; the phone menu carries Contact.

Collapsed grids use `minmax(0, 1fr)`, never bare `1fr`: a swipe strip inside
a `1fr` column widens the column to its content and the page scrolls sideways.

## Accessibility

The site is held to WCAG 2.2 AA. Every page, including the password gate,
runs clean through axe-core (WCAG 2.x A/AA and best-practice rules) and
`html-validate`. To check a page after editing it:

```
npx html-validate index.html work.html work/*.html
```

The rules that shape the code:

- Every colour pair is a token, and every token pair used for text passes
  4.5:1 on the darkest ground it sits on (`--ink-3` was darkened for this).
  The hero lede is set in `--ink` because it sits over the colour wash.
- The nav is a `<nav aria-label="Primary">` landmark; the phone menu button
  reports `aria-expanded`, Escape closes it and hands focus back.
- The layer tabs follow the tablist pattern: arrows, Home and End move the
  selection; hidden panels leave the tab order.
- The walkthrough control leaves the tab order when it fades out. The chart
  carries a text alternative and a data table.
- Tables have header scopes. A table that scrolls sideways is a labelled,
  focusable region.
- Icons are `aria-hidden`; every image has an alt; logos used as decoration
  have an empty one. Focus rings switch to paper on dark grounds.
- `prefers-reduced-motion` switches off every animation and smooth scrolling.
- Nothing scrolls sideways at 320px.

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
