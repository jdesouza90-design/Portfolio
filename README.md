# John DeSouza — portfolio

A static site (plain HTML, CSS and JavaScript, no build step) generated from the
"Strategic Design & Business Results" slide deck. Hosted on Vercel, deployed from
GitHub.

Live: https://john-desouza.com

## Structure

```
index.html                      Home: hero, selected work, how I lead, how I track design, about, contact
work.html                       Work index: all six case studies
work/cross-sell.html            Best Egg · Cross-Sell (Vehicle Equity & Home Secured Loans)
work/verifications.html         Best Egg · Verifications
work/refinance-offers.html      Best Egg · Refinance offers on native mobile
work/staking.html               Chainlink Labs · Staking v0.1
work/no-code-tools.html         Auth0 · No-code tools
work/sign-in-with-ethereum.html Auth0 · Sign-in with Ethereum
styles.css                      Tokens, the ten type roles, components, case-study layout
main.js                         CONFIG links, nav, scroll reveal, scroll-spy, chart, walkthroughs, AI strands, About portrait height
middleware.js                   Vercel Edge Middleware: the password gate for /work/*
vercel.json                     Cache and security headers
ai-process-art.mjs              Draws assets/ai-process.svg, the abstract on the AI card
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
  visitor unlocks all six case studies once.
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
     resume: "/assets/john-desouza-resume.pdf",  // empty hides the "Resume" links
   };
   ```
   Empty values hide their buttons, so nothing looks broken while they're blank.
2. **Check the colleague names.** Team details use first names, roles and
   locations from the deck. Remove anyone who would rather not be listed.

## Type system

Every piece of text on the site takes exactly one of ten roles, defined as
tokens at the top of `styles.css` (`--t-display` … `--t-quote`, with matching
`--lh-*`, `--ls-*` and `--m-*`) and turned into rules in section 2. A role
sets all of type at once: face, size, weight, line-height, letter-spacing,
colour, measure and a zero margin. The serif speaks (display, title, heading,
stat, quote) and is never bold; the sans does the work (subhead, lede, body,
small, micro).

| Role | Class | Use | Size (phone → desktop) |
|---|---|---|---|
| Display | `.t-display` | The page statement, one per page | 42 → 68 |
| Title | `.t-title` | A section's heading | 32 → 46 |
| Heading | `.t-heading` | A row, card or ledger headline; the wordmark; a fact value | 24 → 30 |
| Subhead | `.t-subhead` | A column or card sub-heading, a name | 20, weight 500 |
| Lede | `.t-lede` | The paragraph under a display or title | 18 → 21 |
| Body | `.t-body` | Running text, tabs, the work CTA | 17 |
| Small | `.t-small` | Captions, facts, tables, buttons, chips, nav, cites | 15 |
| Micro | `.eyebrow` | Eyebrows, table heads, ticks, dates: small caps | 12, weight 500 |
| Stat | `.t-stat` | A headline number | 44 → 64 |
| Quote | `.t-quote` | A pull quote | 22 → 28 |

Two rules keep it that way:

- **Headings and paragraphs carry their role as a class in the markup.**
  Inline and structural text (a cell, a cite, a button, a chip) is listed
  under its role in section 2, so it needs no class.
- **Nothing after section 2 sets a face, size, weight, line-height or
  letter-spacing.** The exceptions are `.btn`, `.chip` and `.chart-pill`,
  whose line-height is a box metric; the chart's axis and milestone text,
  set in pixels inside the SVG; and the phone rules, which move a menu row
  and a stacked table label up to body size.

Colour is three tones and weight is two, both set in section 2 and nowhere
else: ink for what leads, ink-2 for what runs, ink-3 for what sits beside on
paper (captions, cites, the footer; it is under 4.5:1 on the panel grounds);
400 runs and 500 names or acts (labels, buttons, `strong`, links in text).
Google Fonts serves only those faces: Crimson Pro 400, DM Sans 400 and 500.

The distances between roles are fixed by the stack rules at the end of
section 2 (eyebrow → title 16, title → lede 24, heading → body 16, subhead →
body 12, stat → caption 8, paragraph → paragraph 16), so a component never
sets them itself. Layout spacing follows the `--sp-*` scale (4 to 128) and
three rhythm tokens: `--section` between sections, `--row` between rows,
`--panel-h` for a visual beside copy.

## Case study skeleton

All six case studies are the same document, in this order:

1. **Hero**: eyebrow, title and one-sentence lede with the outcome stat beside
   them (`data-flow`: it rolls into place digit by digit, lit from above with
   the accent), the project's screens on its own tinted panel, then four facts
   (role, team, timeline, launch) as a `.facts` stat strip: a small label
   above the value at heading size, cells divided by hairlines.
2. **Results**: centred title and lede, then one `.proof` frame: the headline
   stat top-left, a label top-right, and under it the evidence (chart,
   capacity gauge, A/B table, or a hairline list of what shipped where there
   are no published numbers or the number is too new to chart).
3. **My role**: hairline ledger rows (`.ledger`), heading left and paragraph
   right, so a hiring manager reads the leadership story before the work.
4. **How we got there**, always in this order: the problem (copy with a
   tensions list beside an illustration or the old screen), the design (a
   `.row.full` with one framed panel or walkthrough under centred copy), any
   supporting rows (`.row.flip`), then the quotes last (a `.row.full` with an
   intro line saying where they came from). A full-width row is centred and
   its headline takes the Title role with a Lede beneath, the same as a
   section intro; a side-by-side row keeps the Heading role. Each row is one eyebrow,
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
- The chart is drawn in the pixels of its box, so its type stays 13px on a
  phone; the month labels keep the year only where it starts or changes, and
  two milestone notes stack in rows above the plot.
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
- The walkthrough control leaves the tab order when it fades out. The chart's
  plot is a labelled, focusable group: left and right arrows, Home and End
  step through the months and read each one into a live card; the data table
  stays below it. A rolled stat keeps its plain text for screen readers.
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
  `data-series` attribute on the `.chart` element and its milestones from
  `data-annotations`; the table below it is the accessible fallback. The
  line is swept open left to right when the card scrolls in and the closing
  value lands in a pill at the right edge.
- A headline stat with `data-flow` rolls in like an odometer: main.js turns
  each digit into a column of 0 to 9 behind a soft mask; signs, units and
  words stand still. Write the stat as plain text and the script does the
  rest, or leave the attribute off for a stat that should not move.
- Company logos in `assets/logo-*.svg` are the companies' own vector files. Each
  is sized in `styles.css` so the wordmark text matches across all three, since
  the three lockups have different icon-to-text proportions.
- The abstract beside "AI in the process" on the homepage is drawn live by
  `main.js` on a canvas: the same strands in three dimensions, turning slowly,
  with a pause button in the corner. `assets/ai-process.svg` is the still it
  falls back to under reduced motion or without JavaScript; `ai-process-art.mjs`
  draws that SVG from a fixed seed, so change its constants and re-run it
  rather than editing the file.
- Each case study has its own background, set by a `case-*` class on `<body>`
  and on its row in the work index.
- A work-index thumbnail shows the one piece of the design the case study is
  about, not the whole screen shrunk to fit. `.case-media.cutout` floats a
  component keyed out of its screen (`assets/refi-card.webp`,
  `assets/ver-documents.webp`, cut from the 2x sources in `assets/BE/` with
  sharp and their corners keyed); `.cutout.bleed` blows a taller one up until
  it runs off the bottom; `.emerge` sets a whole screen large, coming out of
  a bottom corner of the ground (`--x`/`--y`/`--w` per row set beside the
  rule; `.right` shows the screen's top-right corner instead). Sign-in with
  Ethereum keeps the plain `.wide` ground.
- The three walkthrough recordings are 2.8–7.8 MB and only load when a visitor
  presses Play. They come from the deck's GIFs, so their resolution is capped;
  replace them if you still have the original screen recordings.
- Image URLs carry a `?v=` content hash. If you replace a file in `assets/`,
  update that hash (or any changed value) so visitors stop seeing the old one.
