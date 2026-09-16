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
main.js                         CONFIG links, then one function per feature: nav, scroll reveal, tabs, carousel,
                                walkthroughs, AI strands, fields (hero dots, contact rings), chart, number flow,
                                swipe strips, About portrait height
admin/index.html                Activity dashboard: who is on the site, live (its own password)
middleware.js                   Vercel Edge Middleware: the two password gates, the activity log and its feed
vercel.json                     Cache and security headers
.vercelignore                   Keeps the repo's tooling (this file, VOICE.md, stamp.py, dev.mjs, .claude/) off the deployment
stamp.py                        Re-stamps every ?v= cache hash; run it before committing
dev.mjs                         Local stand-in for the edge: the gates and the dashboard without deploying
ai-process-art.mjs              Draws assets/ai-process.svg, the abstract on the AI card
assets/                         Mockups, logos, walkthrough recordings exported from the deck
og-image.png                    Social preview image used when the link is shared
```

## Deploying

Push to `main` and Vercel builds and publishes automatically. For a one-off
manual deploy, run `npx vercel --prod` from this folder. `.vercelignore` keeps
everything that is not the site (this README, `VOICE.md`, `stamp.py`, the
validator config, `.claude/`) out of the deployment, so none of it is served.

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
- A correct password sends the reader on with `?unlocked`, which plays the
  opener once (see Motion) and is dropped from the address as it starts.
- Running `python3 -m http.server` locally has no edge runtime, so the case
  studies open without a password. `node dev.mjs` serves the site through the
  middleware instead, with an in-memory store and made-up cities (passwords
  `cs` and `admin`), so the gates and the dashboard can be tried at
  http://127.0.0.1:4174.

## Who is on the site

The same middleware records every page view on the site, every case-study
unlock and every wrong password: which page, when, city/region/country
(Vercel's IP geolocation), the referrer (the page that sent them, e.g.
LinkedIn), browser and OS, and a short visitor id so one person's sequence of
views can be followed. Raw IP addresses are never stored or sent; crawlers and
link previewers are skipped.

**The dashboard** at `/admin/` (the "Sign in" link in the home page footer)
shows it live: views and visitors today, a zoomable map of where people are
(Leaflet on Esri's light-grey tiles, one dot per place sized by visits, placed
from Vercel's IP coordinates so it is accurate to about the city), the
where-from / pages / referrers tallies over the last seven days, and a feed
that updates every few seconds as people arrive. It needs two things set up
in Vercel:

1. **A store.** Vercel → Project → Storage → Create Database → Upstash Redis
   (the free plan is plenty), connected to this project. That adds
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the environment; the
   middleware also accepts Upstash's own `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`. The last 2,000 events are kept, plus an
   all-time count. Without a store nothing is kept and the dashboard says so.
2. **A password.** `ADMIN_PASSWORD` in Vercel → Project → Settings →
   Environment Variables. It is separate from the case-study password and,
   like it, deliberately not in this repo. Signing in sets a 30-day cookie;
   `/admin/?signout` clears it.

Redeploy after adding either; environment variables only take effect on the
next deployment.

- Every entry also goes to Vercel → Project → Logs (search `access`). Vercel
  keeps those for one hour on Hobby, one day on Pro.
- To get case-study events as email as well, set `RESEND_API_KEY` (from
  resend.com → API Keys) and `ACCESS_LOG_TO` (the address to notify — with
  Resend's free `onboarding@resend.dev` sender this must be the address the
  Resend account was created with). Optional: `ACCESS_LOG_FROM` to send from a
  verified domain, `ACCESS_LOG_TZ` for the timestamp (default
  `America/New_York`). Plain page views are never emailed.
- Your own visits would flood the log. Signing in to the dashboard mutes
  logging for that browser for a year; on a browser you don't sign in from,
  open any page once with `?owner` on the URL (e.g. `/?owner`) for the same
  effect.

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

1. **Hero**: a breadcrumb trail (Home / Work / this study, the current page
   in plain ink and not a link) and then the eyebrow, title and one-sentence
   lede with the outcome stat beside
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
- Sequences keep their order: the gallery and a three-screen hero become
  swipe strips (`overflow-x: auto` with scroll snap),
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
  product mark drops under the name.
- The phone menu takes its shape and its choreography from harvey.ai, built
  on the site's own tokens: open, the bar goes solid and a sheet of paper
  fills the screen beneath it; the rows (Work, Leadership, About, LinkedIn)
  take the title role in the serif, ink, with the LinkedIn mark at the
  right edge as the row's cue; the two things a reader does from here,
  Contact me and Resume, are buttons at the foot (the `.nav-foot`, hidden on
  desktop, where Resume is a row in the bar and Contact sits in
  `.nav-actions`). The two lines of the button turn into a cross, each
  about its own centre. Everything stays in the tree and transitions both
  ways: opening, the sheet fades in (`--dur-ui`), the foot follows from
  `--dur-press`, the rows from `--dur-hover`, 60ms apart (the reveal's own
  stagger), each a 16px rise; closing runs in reverse and faster, rows and
  foot fading in place together (`--dur-press`) and then the sheet.
  `visibility` waits for the last fade so a hidden sheet takes no taps or
  focus. The page holds its scroll position underneath: the root's overflow
  goes hidden while the menu is open and a `touchmove` guard refuses drags
  that are not scrolling the rows themselves (iOS Safari rubber-bands the
  page regardless of overflow); the rows scroll under a paper fade above
  the foot on a phone held sideways. Nothing moves, so nothing is put back
  on close; the body used to go `position: fixed`, which reset the scroll
  and jumped the page. The sheet measures from the bar itself, not from the
  `.wrap` centred inside it.

Collapsed grids use `minmax(0, 1fr)`, never bare `1fr`: a swipe strip inside
a `1fr` column widens the column to its content and the page scrolls sideways.

## Motion

Section 9 of `styles.css` and the "Scroll reveal" block of `main.js`. The
rule of the site is that controls answer inside 200ms and nothing a user
triggers runs past 300ms (`--dur-press` 140, `--dur-hover` 200, `--dur-ui`
240, all on `--ease`). The one slow move is a section arriving as the reader
scrolls to it, and every page gets it the same way:

- **Every block rises into place.** A block waits 48px below its position
  at opacity 0 and travels up over 700ms: the fade runs straight (`linear`)
  so the block is still translucent while it moves and lands opaque; the
  travel is on `--ease-soft` (an out-cubic; `--ease` is too quick over
  700ms to be seen). Tokens: `--reveal-y`, `--dur-reveal`, `--ease-soft`.
- **A block starts once its top crosses a line 70% down the viewport**, so
  the move happens where the reader is looking rather than at the bottom
  edge. As the page runs out of scroll the line drops toward the bottom
  edge, so the last blocks on a page (the closing band, the footer) never
  wait for room that isn't there. On first paint everything already on
  screen rises at once; nothing on the first screen waits for a scroll.
- **Blocks that cross the line in the same frame follow each other 60ms
  apart**, in document order (`--reveal-i`, capped at 240ms). The stagger
  is per batch, so a block arriving alone never waits.
- **The unit is a direct child of a section's `.wrap`** (`main > section >
  .wrap > *`, or the section itself when it has no wrap). `main.js` tags
  each with `data-reveal`; a new page built on the skeleton needs no
  attribute at all. Put `data-reveal` on an element yourself only to change
  the unit: children carrying it rise on their own and their parent is left
  alone (the case rows on the homepage and work index, the portrait and
  text of About). Nothing nests: a block inside a block would travel twice.
- **The hero's copy has its own cascade** on load: eyebrow, `h1` and lede
  carry `data-rise style="--i:N"` (N = 0, 1, 2), a 12px rise at 70ms steps
  on top of the block's own reveal. Nothing else animates by attribute.
- **A fresh unlock opens behind a sheet** (`initUnlock` in `main.js`,
  section 8b of `styles.css`). The gate's redirect carries `?unlocked`; a
  one-line script in each case study's head sets `html.unlock` before first
  paint, which holds the page out of view (a 3s CSS animation, so a failed
  script can never keep it hidden) and pauses the hero's cascade. The sheet
  is the project's own ground with no pattern, split by a 1px accent seam
  that draws in over 500ms; `Unlocked`, the page's `h1` and a two-sentence
  note rise on it (220/320/460ms); at 1.6s the copy fades, the seam becomes
  the two door edges and the halves part over 850ms on `--ease-in-out`; at
  1.98s `unlock:open` fires, which starts the scroll reveal (`afterOpener`)
  and releases the cascade, so the first screen rises as the doors part.
  About 2.6s in all, the one thing on the site that runs past 300ms after a
  user action; a click on the sheet or Escape jumps to the end. Under
  reduced motion the sheet shows still for 1.4s and goes. The param is
  dropped from the address as it starts, so a refresh never replays it.
- **What plays inside a block waits for the block.** The chart sweep, the
  odometer (`data-flow`) and the experience timeline each start after their
  block has revealed (`onceInView` in `main.js` listens for the `reveal`
  event a block dispatches as it starts; `--exp-wait` is `--dur-reveal`),
  and the gauge is held paused by CSS until then. New in-view work goes
  through `onceInView`, never its own observer, so it inherits the wait.
- **Two grounds answer the cursor** (`initFields` in `main.js`, over any
  block with `data-field` and a `canvas.field`). The hero's is a 24px grid of
  4px ink circles, each breathing on three slow waves; the cursor pushes the
  dots within 150px away and they spring home, turning green while they
  travel; a click or tap sends a ring out through them. It is ramp.com's
  hero on the site's paper, with their measured values (push 10 with a
  square falloff, spring .018, damping .8, ripple at 420px/s) and the dots
  at a quarter strength, thinning to a third of that under the box the
  statement and its buttons occupy over a long soft edge, so the copy reads
  clean without a hole in the field (`PAD`, `FEATHER`, `UNDER` in the dots
  block). A drifter, a soft taupe blob (`BR`, `BA`), roams the field on a
  slow figure and pushes the dots the way the cursor does; a cursor that
  reaches it takes it over until it leaves the hero. Get in touch keeps its
  rings (paper hairlines at 42px
  from behind the buttons) but draws them live: still at rest and identical
  to the stylesheet's, travelling outward while the cursor is over the band,
  brightening and bulging around it, carrying a wave on a click. Both ignore
  the cursor over links and buttons, fade their push out within a second of
  it resting, draw at 30fps idle and 60 in play, only on screen, stop under
  the hero's pause button, and draw one still frame under reduced motion;
  the rings are not redrawn at all until something moves. To add a piece,
  give `fields` a factory returning `{ resize, frame }` and name it in
  `data-field`; a piece that returns `false` from `frame` when still is left
  alone until the pointer or a ripple wakes it.
- **Content is visible by default.** The hidden state is `.anim
  [data-reveal]`, and only the script adds `anim` to `<html>` after it has
  found the observer, so a blocked or failed script never hides a section;
  if nothing has revealed after 2.5s the class is dropped again. Under
  `prefers-reduced-motion` the script never opts in and section 9 resets
  every block, so the page is simply there.

To see a reveal from the code, scroll a page in `puppeteer-core` with
`Animation.setPlaybackRate(0.2)` over CDP and screenshot at intervals; the
Browser pane cannot, because a hidden pane paints no frames and the
observers never fire.

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
  The hero lede is set in `--ink` because it sits over the dot field.
- The nav is a `<nav aria-label="Primary">` landmark; the phone menu button
  reports `aria-expanded`, Escape closes it and hands focus back. The case
  studies' breadcrumb is a second landmark, `<nav aria-label="Breadcrumb">`
  around an ordered list, the current page marked `aria-current="page"` and
  the slashes `aria-hidden`.
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
- Experience on the homepage is four roles on one track, oldest first,
  under a "Recent experience" eyebrow (`h3.exp-head` + `ol.exp`): the
  company's lockup, the title, team size (where there was a team) and
  location, and the dates. Each item draws its own run of track and the roles
  already held draw theirs in ink, so the ink ends at the current role; the
  ink sweeps along once the list has scrolled in. Under 700px the track turns
  down the left. Company logos in `assets/logo-*.svg` are the companies' own
  vector files, sized in `styles.css` so the wordmark text matches across the
  row; `logo-charm.svg` is traced from the PNG lockup on charmsolutions.ai
  (the only format they publish) and, being the widest, is the one that
  shrinks to its column first. A lockup letterboxes in its row rather than
  squeezing when a column is narrower than it.
- Under the track, five lines senior leaders and peers wrote about John run
  in the case-study testimonial carousel (`.kudos`): one quote at a time,
  cross-fading, with the company mark centred above it and the source line
  under it (previous, dots, next, pause; a quote every 7 s while on screen).
  The quotes are verbatim with the project sentences cut and the people left
  out by John's choice, so the mark stands in for the byline and the source
  says only "Senior leader" or "Peer feedback".
- "Three layers, one chain" on the homepage is one card mirroring the AI card:
  Figure A on the left (`.fig-panel`, three nested rings on the panel ground,
  after the figure on Mercury's About page), the copy and the layer tabs on
  the right. The rings share a bottom point, not a centre, so each has a tall
  band for its label; the panel is a size container, so the figure fits
  whichever of the panel's width and height is tighter while the copy sets
  the height. `initTabs` lights the ring (`[data-ring]`) for the selected
  tab, and a click inside a ring picks its tab (the circle is the hit area,
  the innermost ring winning where they overlap; the tabs remain the
  keyboard control). As the card arrives the figure draws itself from the centre (the inner
  disc, then each ring growing out of it, labels fading in as they settle),
  timed off the reveal like the experience track. Under 1100px the card is
  one column with the figure as a cover, and on a phone the ring names step
  down to the Small role.
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
  Ethereum keeps the plain `.wide` ground. Where a screen runs off the ground
  (`.emerge`, `.bleed`) the ground fades it out over the last stretch before
  each edge (`--fade`, 40 to 80 px): the `::after` overlay paints the ground
  itself, masked to a band along the edges, so the screen dissolves into it
  instead of stopping at the clip line, and nothing inside the band is meant
  to be read. Contained images (`.cutout`, `.wide`) keep their crisp edges.
- The three walkthrough recordings are 2.8–7.8 MB and only load when a visitor
  presses Play. They come from the deck's GIFs, so their resolution is capped;
  replace them if you still have the original screen recordings.
- Image, stylesheet, script, icon and social-image URLs carry a `?v=` content
  hash. After replacing any of them run `python3 stamp.py`, which restamps every
  page and the password gate in `middleware.js`, so visitors and link
  unfurlers stop seeing the old file.
