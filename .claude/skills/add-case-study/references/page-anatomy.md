# Page anatomy

Every case study is the same document in the same order. This file lists each block, the
slot names it takes, the variants that exist, and the markup for each variant copied from a
live page. Use the snippets as they are; only the content changes. Anything not listed here
is not a pattern the site has, and adding one means adding CSS, so ask before inventing.

Contents
1. Conventions that apply everywhere
2. Hero
3. Results and the proof variants
4. The story: row types and their contents
5. How I led it
6. What I'd do differently
7. Next

---

## 1. Conventions that apply everywhere

- **No eyebrow over a heading.** A section or row heading names the section itself (The
  problem, How I led it, Key decisions, Results); `.eyebrow` is only for a chart's, figure's
  or stat's label (Outcome, Monthly originations · USD) and the Next case study band.
- **Type roles.** Every heading and paragraph carries its role as a class: `.eyebrow`,
  `.t-display` (the h1), `.t-title` (section title), `.t-lede`, `.t-heading` (row or ledger
  heading), `.t-subhead` (column heading), `.t-body`, `.t-small`, `.t-stat`, `.t-quote`.
  Inline text (cells, cites, chips, buttons) gets its role from its component in
  `styles.css` section 2. Never set a font size, weight or line-height.
- **Images.** Always `decoding="async"`, `width`, `height` and `alt`. Everything below the
  hero also gets `loading="lazy"`; hero images don't. Paths are `../assets/<file>` with no
  `?v=` (stamp.py adds it). Width and height are the file's real pixels (from `webp.sh`).
- **Hero animation.** Only the hero's `h1` and lede carry `data-rise style="--i:N"`
  with N = 0, 1, 2. Nothing else on the page animates by attribute: every direct child of a
  section's `.wrap` rises into place on scroll by itself (48px over 700ms once its top
  crosses 70% of the viewport; see Motion in the README). Keep that structure, one block
  per child of `.wrap`, and never put `data-reveal` inside another `data-reveal`. Anything
  that plays inside a block (chart, `data-flow`, gauge) waits for the block's reveal on its
  own through `onceInView`.
- **The unlock opener.** The first time a reader opens a case study after the password,
  the page opens behind a sheet that parts like doors (`initUnlock` in `main.js`, section
  8b of `styles.css`, Motion in the README). Two things on the page make it work, and both
  come from the template: the one-line `<script>` in the `<head>` that sets `html.unlock`
  when the address carries `?unlocked` (it must stay before the stylesheet link; without
  it the page flashes before the sheet), and the `h1`, whose text is what the sheet shows
  under "Unlocked". So the `h1` is the case study's name as plain text, no markup inside,
  and a name over about 40 characters wraps to three lines on the sheet at desktop. The
  sheet's copy is the same on every page; nothing per case study is written for it.
- **Section order and ids** are the same on every page: hero, `story` (The problem: the
  `problem` row, then `research`), `role` (How I led it), `key-decisions` (`design`,
  `decisions` and any other rows), `results`, `reception`, `retro`, then Next. Extra rows take a short id of their own
  (`feeds`, `community`, `customize`).
- **Inline styles** are only allowed for `--i` and `--crop-pos` (html-validate enforces it).
- **Icons** all come from Hugeicons' free set, inline SVG on a 24-unit viewBox, 1.5 stroke,
  `aria-hidden="true"`, ink with one accent detail: `class="ac"` on a stroked path or
  `class="ac-fill"` on a filled shape. Never draw one by hand; `node hugeicon.mjs` at the
  repo root prints any of them in this markup (README, Icons).
- **Arrows in prose** are not allowed (VOICE.md); `→` appears only in the eyebrow term 0→1.
- **Quotes** keep the speaker's grammar. `<blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Label</b>Source</cite></blockquote>`.

---

## 2. Hero

Slots: `NAME` (twice: the breadcrumb's current item and the h1), `LEDE`,
outcome (two variants), hero panel (four variants), four facts. The breadcrumb's first
two items never change; the last is plain text with `aria-current="page"`, not a link.

```html
<section class="cs-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><span class="crumb-sep" aria-hidden="true">/</span><a href="/work.html">Work</a></li>
        <li aria-current="page"><span class="crumb-sep" aria-hidden="true">/</span>{{NAME}}</li>
      </ol>
    </nav>
    <div class="hero-lead">
      <div class="cs-hero-copy">
      <h1 class="t-display" data-rise style="--i:0">{{NAME}}</h1>
      <p class="t-lede" data-rise style="--i:1">{{LEDE}}</p>
    </div>
      {{OUTCOME}}
    </div>
    {{HERO_PANEL}}
    <dl class="facts">
      <div><dt>Role</dt><dd>{{FACT_ROLE}}</dd></div>
      <div><dt>Team</dt><dd>{{FACT_TEAM}}</dd></div>
      <div><dt>Timeline</dt><dd>{{FACT_TIMELINE}}</dd></div>
      <div><dt>{{FACT_4_LABEL}}</dt><dd>{{FACT_4}}</dd></div>
    </dl>
  </div>
</section>
```

The lede is one or two sentences that say what the thing is and what it does for the person
using it, not what it achieved (the stat beside it does that). The `h1` wraps at 16ch, so a
long name is fine.

**Outcome, with a number.** `data-flow` makes it roll into place digit by digit when the
page opens (main.js turns each digit into a masked column; signs, units and words stand
still, and the plain text stays for screen readers). Write the stat as plain text.
```html
<div class="outcome-stat"><p class="eyebrow">Outcome</p><div class="t-stat" data-flow>$7.56M</div><p class="t-small">New secured-loan originations from launch through February 2026</p></div>
```

**Outcome, without a number** (statement at heading size, and say there are no metrics):
```html
<div class="outcome-stat"><p class="eyebrow">Outcome</p><p class="t-heading">A login flow could be configured, tested and published without writing code</p><p class="t-small">No published usage metrics</p></div>
```

**Hero panel variants.** The panel is a `figure` on the project's tinted ground.

| Screens | Markup |
|---|---|
| Two phone screens | `<figure class="panel hero-panel two">` + two `img` |
| Three phone screens | `<figure class="panel hero-panel three">` + three `img` |
| One wide product shot | `<figure class="panel hero-panel wide">` + one `img` (rounded, shadowed) |
| One wide illustration | `<figure class="panel hero-panel wide flat">` + one `img` (rounded, no shadow) |

```html
<figure class="panel hero-panel two">
  <img decoding="async" width="468" height="1200" src="../assets/ver-step1.webp" alt="Step 1: Action required. Complete the following action items to finish your application.">
  <img decoding="async" width="376" height="1200" src="../assets/ver-thankyou.webp" alt="Thank you screen confirming documents were submitted, with a 3 of 3 documents checklist">
</figure>
```

**Facts.** Four cells, always. Labels 1 to 3 are Role, Team, Timeline unless the project's
story needs a different third (Staking uses Time zones). Values are short: a title, a count,
a duration, a date or a phrase. Numerals always.

---

## 3. Results and the proof variants

Slots: `RESULTS_LEDE`, `PROOF`. The title is "Results".

```html
<section class="cs-section" id="results">
  <div class="wrap">
    <header class="section-intro">
      <h2 class="t-title">Results</h2>
      <p class="t-lede">{{RESULTS_LEDE}}</p>
    </header>
    {{PROOF}}
  </div>
</section>
```

The title is the result as a fragment ("Declines that became loans", "Full capacity within
three hours"); it must not repeat the number shown right below it. The lede is three
sentences: what was wrong, what we shipped, where the number comes from.

**Chart** (a series over time; values are formatted as USD by `main.js`, so dollars only).
`data-series` is a JSON array of `{label, value}`, labels written "Oct 2025" so the axis
can shorten them; `data-annotations` marks milestones by index. `main.js` draws a line over
a soft area, sweeps it open when the card scrolls in, lands the closing value in a pill at
the right edge, and reads each month into a card on hover, tap or the arrow keys. The table
is the accessible fallback and must carry the same numbers.
```html
<div class="proof chart" data-chart data-label="New non-affiliate secured loan originations by month, October 2025 to February 2026"
     data-series='[{"label":"Oct 2025","value":55256},{"label":"Nov 2025","value":410718},{"label":"Dec 2025","value":926926},{"label":"Jan 2026","value":1260396},{"label":"Feb 2026","value":4906705}]'
     data-annotations='[{"at":0,"text":"Vehicle Equity · 100% rollout 10/30"},{"at":3,"text":"Home Secured · 100% rollout 1/29"}]'>
  <div class="proof-head">
    <div><div class="t-stat" data-flow>$7.56M</div><small>New non-affiliate secured-loan originations from the Cross-Sell path, Oct 2025 to Feb 2026</small></div>
    <span class="eyebrow chart-legend"><i class="dot" aria-hidden="true"></i>Monthly originations · USD</span>
  </div>
  <details class="data">
    <summary>View as a table</summary>
    <table>
      <thead><tr><th scope="col">Month</th><th scope="col">Originations</th><th scope="col">Milestone</th></tr></thead>
      <tbody>
        <tr><th scope="row">Oct 2025</th><td>$55,256</td><td>Vehicle Equity, 100% rollout on Oct 30</td></tr>
        <tr><th scope="row">Nov 2025</th><td>$410,718</td><td></td></tr>
      </tbody>
    </table>
  </details>
</div>
```

**Comparison table** (A/B test, before/after). The wrapper is a labelled region that scrolls
sideways where the table is wider than the frame (just above the 640px phone layer, which
stacks the rows); `main.js` keeps it a tab stop only while it overflows, and the
`tabindex="0"` in the markup stands without the script. The winning column carries
`class="hl"`.
```html
<section class="table-wrap" aria-label="A/B test results, Design A against Design B" tabindex="0">
  <table>
    <thead><tr><th scope="col">Metric</th><th scope="col">Design A (current)</th><th scope="col" class="hl">Design B (document-led)</th></tr></thead>
    <tbody>
      <tr><th scope="row">All 3 documents uploaded</th><td>Partial, drop-off observed</td><td class="hl">100% completion rate</td></tr>
    </tbody>
  </table>
</section>
```

**Capacity bar** (a fill or a time-to-target). The bar is a `role="img"` with the story in
its label; the ticks carry the scale.
```html
<div class="proof">
  <div class="proof-head">
    <div><div class="t-stat" data-flow>25M LINK</div><small>staked, with the pool full within 3 hours of launch</small></div>
    <span class="eyebrow">Pool capacity · hours after launch</span>
  </div>
  <div class="gauge" role="img" aria-label="Pool capacity filled from 0 to 100 percent over the three hours after launch">
    <svg viewBox="0 0 360 180" aria-hidden="true" focusable="false">
      <defs><linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
      <path class="track" d="M50,178 A130,130 0 0 1 310,178"/>
      <path class="fill" d="M50,178 A130,130 0 0 1 310,178"/>
      <line class="notch" x1="180" y1="20" x2="180" y2="76" transform="rotate(-30 180 178)"/>
      <line class="notch" x1="180" y1="20" x2="180" y2="76" transform="rotate(30 180 178)"/>
      <g class="needle"><line class="slot" x1="180" y1="20" x2="180" y2="76"/><line class="bar" x1="180" y1="25" x2="180" y2="71"/></g>
    </svg>
    <span class="lbl l0">0 hr</span><span class="lbl l1">1 hr</span><span class="lbl l2">2 hr</span><span class="lbl l3">3 hr · full</span>
  </div>
</div>
```

**Quotes grid** (qualitative results, three quotes). The lede must say "There are no
published usage metrics for this project, so the outcome is qualitative" or equivalent.
```html
<div class="quotes">
  <blockquote class="quote"><p class="t-quote">"The profile meta is very handy, reduces complexity for developers and most likely better performance."</p><cite><b>Martin Walsh</b>@martin64k · Dec 10, 2021</cite></blockquote>
  <blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Developer feedback</b></cite></blockquote>
  <blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Developer feedback</b></cite></blockquote>
</div>
```

---

## 4. The story: row types and their contents

```html
<section class="cs-section" id="story">
  <div class="wrap">
    <header class="section-intro">
      <h2 class="t-title">The problem</h2>
    </header>
    {{ROWS}}
  </div>
</section>
```

The problem section (`#story`) holds the problem row and, where there is one, the research
row that proves it (`.row.full#research`, the quotes carousel with a lede saying where they
came from). Its section intro is the Title "The problem"; the problem row carries the body
and the tensions list and has no heading of its own.

Every other row lives in `#key-decisions`, after How I led it, under the Title "Key
decisions". In order: the design (`.row.full`), then any of decisions (`.row.full`), a
second surface (`.row.flip`), a second deliverable (`.row.full`). Each row has one heading,
and it is the decision itself, under eight words: "Only the card changed", "A checklist
replaced the progress bar", "Phase 1: a live preview". Never a label like "The design" or
"Design decisions". At most one short paragraph follows before the list or visual. Split rows
(`.row`, `.row.flip`) take `t-heading` + `t-body`; full-width rows (`.row.full`) take
`t-title` + `t-lede`. Public reaction after launch is not a row: it is the `#reception`
section after Results.

**Row types**

| Class | Layout | Use |
|---|---|---|
| `.row` | copy left, fixed-height panel right | the problem, with a "before" screen |
| `.row.flip` | panel left, copy right | research quotes with a screen, a second surface |
| `.row.full` | copy on top, visual full width | galleries, flows, decision grids, walkthroughs, quote grids |

**Problem row** (always first; the tensions list is its signature; its heading lives in
the section intro above, so the row starts on the body):
```html
<article class="row" id="problem">
  <div class="row-copy">
    <p class="t-body">{{PROBLEM_BODY}}</p>
    <ul class="tensions">
      <li><strong>Pivot</strong><span>The decline had to become a second offer, not a rejection.</span></li>
      <li><strong>Trust</strong><span>Applicants had just been told no, so the offer had to read as help, not a catch.</span></li>
      <li><strong>Business</strong><span>Every declined applicant left the funnel with nothing, and so did Best Egg.</span></li>
    </ul>
  </div>
  <figure class="panel"><img decoding="async" width="450" height="1200" src="../assets/cs-decline.webp" alt="The original decline screen: 'Unfortunately, we are unable to approve your application at this time', followed by a third-party partner offer." loading="lazy"></figure>
</article>
```
Panel modifiers: `.panel.flat` for an illustration (rounded like every panel image, but no shadow), `.panel.wide` for a
landscape shot, `.panel.wide.crop` with `style="--crop-pos: 30% 0"` to show one corner of a
large screen at full scale, `.panel.cutout` for one UI card cut out of its screen with
transparent rounded corners (sharp `extract` + an SVG `dest-in` mask; see Refinance offers),
floating on the ground with a drop shadow that follows the alpha.

**Design row, gallery of three** (`.row.full`):
```html
<article class="row full" id="design">
  <div class="row-copy">
    <h3 class="t-title">The design</h3>
    <p class="t-lede">{{DESIGN_BODY}}</p>
  </div>
  <div class="panel">
    <div class="gallery">
      <figure><img decoding="async" width="780" height="2000" src="../assets/ver-upload-list.webp" alt="Upload documents checklist: W-2, paystub, identification, 0 of 3 complete" loading="lazy"><figcaption>Document checklist</figcaption></figure>
      <figure><img decoding="async" width="780" height="2000" src="../assets/ver-w2-empty.webp" alt="W-2 upload screen with guidance and an empty state" loading="lazy"><figcaption>Per-document upload</figcaption></figure>
      <figure><img decoding="async" width="780" height="2000" src="../assets/ver-w2-submitted.webp" alt="W-2 upload screen with a submitted file listed and a Done button" loading="lazy"><figcaption>Submitted state</figcaption></figure>
    </div>
  </div>
</article>
```

**Design row, before and after** (`.row.full`, the same `.gallery`): the old screen first,
then the new ones, each figcaption starting "Before:" or "After:" so the sequence reads on a
phone where the gallery becomes a swipe strip. From refinance-offers.html:
```html
<div class="panel">
  <div class="gallery">
    <figure><img decoding="async" width="750" height="2000" src="../assets/refi-home-before.webp" alt="Before: the home screen with the blue Personal Loan card offering another loan of up to $10,000" loading="lazy"><figcaption>Before: the generic invitation</figcaption></figure>
    <figure><img decoding="async" width="750" height="1800" src="../assets/refi-home.webp" alt="After: the home screen with the refinance card under the loan, reading 'Refi might be right for you'" loading="lazy"><figcaption>After: the card on Home</figcaption></figure>
    <figure><img decoding="async" width="750" height="1624" src="../assets/refi-offers.webp" alt="After: the Offers tab with the same refinance card and the eligibility disclosures link" loading="lazy"><figcaption>After: the same card on Offers</figcaption></figure>
  </div>
</div>
```

**Design row, walkthrough** (`.row.full`). The poster is a `.jpg`; the animation loads on
Play. The note says what it is and, if it is over 3 MB, roughly how big.
```html
<div>
  <div class="walk">
    <img decoding="async" width="932" height="720" src="../assets/staking-walkthrough-poster.jpg" data-anim="../assets/staking-walkthrough.webp" alt="Walkthrough of the Chainlink Staking early-access flow" loading="lazy">
    <button class="btn btn-sm play" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"/></svg> <span>Play walkthrough</span></button>
  </div>
  <p class="walk-note t-small">Screen recording of the v0.1 early-access flow.</p>
</div>
```

**Decisions row** (`.row.full` with `.cols`). Three columns, each an icon, a two-word `h4`,
one sentence, and a `.shot` figure: a crop of the real screen at native scale (480 to 750
wide, about 2:1), shown as the top-left corner of a framed card. This is the only
place the icon-over-heading grid appears on a case study; don't reuse it for role or retro.
```html
<article class="row full" id="decisions">
  <div class="row-copy">
    <h3 class="t-title">Design decisions</h3>
  </div>
  <div class="cols">
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3H21"/><path class="ac" d="M3 9H11"/><path d="M3 15H21"/><path d="M3 21H11"/></svg>
      <h4 class="t-subhead">Content strategy</h4>
      <p class="t-body">The copy moved from "Rejected" to "A different path".</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="750" height="400" src="../assets/cs-piece-copy.webp" alt="Almost there, we just need a few details about your vehicle, with a See vehicle requirements link" loading="lazy"></span></figure>
    </div>
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M22 12C22 8.25027 22 6.3754 21.0451 5.06107C20.7367 4.6366 20.3634 4.26331 19.9389 3.95491C18.6246 3 16.7497 3 13 3H11C7.25027 3 5.3754 3 4.06107 3.95491C3.6366 4.26331 3.26331 4.6366 2.95491 5.06107C2 6.3754 2 8.25027 2 12C2 15.7497 2 17.6246 2.95491 18.9389C3.26331 19.3634 3.6366 19.7367 4.06107 20.0451C5.3754 21 7.25027 21 11 21H13C16.7497 21 18.6246 21 19.9389 20.0451C20.3634 19.7367 20.7367 19.3634 21.0451 18.9389C22 17.6246 22 15.7497 22 12Z"/><path class="ac" d="M14.5 3.5L14.5 20.5"/><path class="ac" d="M19 7H17.5" stroke-linecap="round"/><path class="ac" d="M19 11H17.5" stroke-linecap="round"/><path d="M8 10L9.22654 11.0572C9.74218 11.5016 10 11.7239 10 12C10 12.2761 9.74218 12.4984 9.22654 12.9428L8 14" stroke-linecap="round"/></svg>
      <h4 class="t-subhead">Progressive disclosure</h4>
      <p class="t-body">One idea per screen, with the detail behind "Learn more".</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="480" height="240" src="../assets/cs-piece-disclosure.webp" alt="Secured by your vehicle: borrow money based on your car's equity, without giving up the keys. Learn more" loading="lazy"></span></figure>
    </div>
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3.88884 9.66294C4.39329 10 5.09552 10 6.49998 10C7.90445 10 8.60668 10 9.11113 9.66294C9.32951 9.51702 9.51701 9.32952 9.66292 9.11114C9.99998 8.60669 9.99998 7.90446 9.99998 6.5C9.99998 5.09554 9.99998 4.39331 9.66292 3.88886C9.51701 3.67048 9.32951 3.48298 9.11113 3.33706C8.60668 3 7.90445 3 6.49998 3C5.09552 3 4.39329 3 3.88884 3.33706C3.67046 3.48298 3.48296 3.67048 3.33705 3.88886C2.99998 4.39331 2.99998 5.09554 2.99998 6.5C2.99998 7.90446 2.99998 8.60669 3.33705 9.11114C3.48296 9.32952 3.67046 9.51702 3.88884 9.66294Z"/><path d="M14.8888 9.66294C15.3933 10 16.0955 10 17.5 10C18.9044 10 19.6067 10 20.1111 9.66294C20.3295 9.51702 20.517 9.32952 20.6629 9.11114C21 8.60669 21 7.90446 21 6.5C21 5.09554 21 4.39331 20.6629 3.88886C20.517 3.67048 20.3295 3.48298 20.1111 3.33706C19.6067 3 18.9044 3 17.5 3C16.0955 3 15.3933 3 14.8888 3.33706C14.6705 3.48298 14.483 3.67048 14.337 3.88886C14 4.39331 14 5.09554 14 6.5C14 7.90446 14 8.60669 14.337 9.11114C14.483 9.32952 14.6705 9.51702 14.8888 9.66294Z"/><path d="M3.88884 20.6629C4.39329 21 5.09552 21 6.49998 21C7.90445 21 8.60668 21 9.11113 20.6629C9.32951 20.517 9.51701 20.3295 9.66292 20.1111C9.99998 19.6067 9.99998 18.9045 9.99998 17.5C9.99998 16.0955 9.99998 15.3933 9.66292 14.8889C9.51701 14.6705 9.32951 14.483 9.11113 14.3371C8.60668 14 7.90445 14 6.49998 14C5.09552 14 4.39329 14 3.88884 14.3371C3.67046 14.483 3.48296 14.6705 3.33705 14.8889C2.99998 15.3933 2.99998 16.0955 2.99998 17.5C2.99998 18.9045 2.99998 19.6067 3.33705 20.1111C3.48296 20.3295 3.67046 20.517 3.88884 20.6629Z"/><path class="ac-fill" d="M14.8888 20.6629C15.3933 21 16.0955 21 17.5 21C18.9044 21 19.6067 21 20.1111 20.6629C20.3295 20.517 20.517 20.3295 20.6629 20.1111C21 19.6067 21 18.9045 21 17.5C21 16.0955 21 15.3933 20.6629 14.8889C20.517 14.6705 20.3295 14.483 20.1111 14.3371C19.6067 14 18.9044 14 17.5 14C16.0955 14 15.3933 14 14.8888 14.3371C14.6705 14.483 14.483 14.6705 14.337 14.8889C14 15.3933 14 16.0955 14 17.5C14 18.9045 14 19.6067 14.337 20.1111C14.483 20.3295 14.6705 20.517 14.8888 20.6629Z"/></svg>
      <h4 class="t-subhead">Consistent patterns</h4>
      <p class="t-body">Built from existing design system components, so the offer looks like the rest of the application.</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="480" height="260" src="../assets/cs-piece-offer.webp" alt="A Select offer button and a View loan summary link" loading="lazy"></span></figure>
    </div>
  </div>
</article>
```
Pick each decision's icon from Hugeicons by what the heading says (`node hugeicon.mjs --find
toggle` searches the names), then print it with its one accent element:
`node hugeicon.mjs ToggleOn --class col-icon --ac-fill 0`. `--parts` numbers the elements
so you can choose the detail to light, the part the decision changed (the knob on a toggle,
the glass over a search area, the ticks in a checklist).

**Decisions row, stacked** (`.row` with `.tensions.stack` and a `.panel.cutout`). When the
decisions all live inside one card, stack them on the left as a hairline list (heading over
text, no icons) and float the card itself on the right. Refinance offers uses this.
```html
<article class="row" id="decisions">
  <div class="row-copy">
    <h3 class="t-heading">Design decisions</h3>
    <ul class="tensions stack">
      <li><h4 class="t-subhead">A suggestion, not a notice</h4><p class="t-body">The copy moved from "Just wanted to let you know" to "Refi might be right for you".</p></li>
      <li><h4 class="t-subhead">…</h4><p class="t-body">…</p></li>
      <li><h4 class="t-subhead">…</h4><p class="t-body">…</p></li>
    </ul>
  </div>
  <figure class="panel cutout"><img decoding="async" width="666" height="252" src="../assets/refi-card.webp" alt="The refinance card: …" loading="lazy"></figure>
</article>
``` Lines for content, stacked rectangles for disclosure, a 2×2 grid for
patterns, a gauge arc for capacity, a checklist for status.

**Research row** (`.row.flip` with `.quote-list`, a screen beside it):
```html
<article class="row flip" id="research">
  <div class="row-copy">
    <h3 class="t-heading">What we heard</h3>
    <ul class="quote-list">
      <li><blockquote class="quote"><p class="t-quote">"If that 'in review' would've been maybe bigger or a different color, I would've noticed it earlier."</p><cite><b>Clear status badge</b>Usability session</cite></blockquote></li>
      <li><blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Communication</b>Usability session</cite></blockquote></li>
      <li><blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Visual cues</b>Usability session</cite></blockquote></li>
    </ul>
  </div>
  <figure class="panel"><img decoding="async" width="376" height="1200" src="../assets/ver-thankyou.webp" alt="Thank you screen: you've successfully submitted your documents, you should hear from us in 1 to 3 business days" loading="lazy"></figure>
</article>
```
Heading variants: "What we heard" (research), "What customers told us", "Community
reaction" (public posts; use the `.quotes` grid in a `.row.full` instead, as Staking does).

**Second-surface row** (`.row.flip` with a cropped wide panel):
```html
<article class="row flip" id="feeds">
  <div class="row-copy">
    <h3 class="t-heading">Below the fold</h3>
    <p class="t-body">Under the pool sit the data feeds it secures: each feed's latest answer, its node operators and whether each one responded.</p>
  </div>
  <figure class="panel wide crop" style="--crop-pos: 30% 0"><img decoding="async" width="1600" height="813" src="../assets/staking-feeds.webp" alt="Data feeds secured: ETH/USD feed details and node operator responses" loading="lazy"></figure>
</article>
```

---

## 5. How I led it

Three hairline ledger rows. The optional `t-lede` gives org context. Headings are the
labels from the interview; bodies are one to three sentences with "I" and "we" used
precisely.
```html
<section class="cs-section" id="role">
  <div class="wrap">
    <header class="section-intro">
      <h2 class="t-title">How I led it</h2>
      <!-- optional: <p class="t-lede">{{ROLE_LEDE}}</p> -->
    </header>
    <div class="ledger">
      <div class="ledger-row"><h3 class="t-heading">{{ROLE_1_LABEL}}</h3><p class="t-body">{{ROLE_1_BODY}}</p></div>
      <div class="ledger-row"><h3 class="t-heading">{{ROLE_2_LABEL}}</h3><p class="t-body">{{ROLE_2_BODY}}</p></div>
      <div class="ledger-row"><h3 class="t-heading">{{ROLE_3_LABEL}}</h3><p class="t-body">{{ROLE_3_BODY}}</p></div>
    </div>
  </div>
</section>
```

---

## 6. What I'd do differently

A narrow note with run-in labels. Optional. Two or three paragraphs; the last one can be
"What held", which keeps the section from reading as a confession.
```html
<section class="cs-section" id="retro">
  <div class="wrap">
    <header class="section-intro">
      <h2 class="t-title">What I'd do differently</h2>
    </header>
    <div class="note">
      <p class="t-body"><strong>Research timing.</strong> The qualitative signal was strong going in, but the A/B test came after Vehicle Equity launched. Testing the redirect copy earlier would have saved iteration after go-live.</p>
      <p class="t-body"><strong>Sequencing.</strong> …</p>
      <p class="t-body"><strong>What held.</strong> …</p>
    </div>
  </div>
</section>
```
The title lists the labels: "Research timing, sequencing and what held".

---

## 7. Next

The closing band. `PREV_SLUG`, `NEXT_SLUG` and `NEXT_NAME` come from the ring in
`wiring.md` §5: the next page is its full name as the one link in `p.t-title.cs-next-title`,
and the previous page is the text link straight under it, "Previous case study"
(`.cs-prev-link`), led by a left arrow. Under that, `.actions` holds All work
(`.cs-all-link`, a text link led by a grid) and the Contact me button. The previous link is
the site's one arrowed link: elsewhere a link is underlined text or a button. The markup
is copied from a live page; only the three slots change.
```html
<section class="cs-next">
  <div class="wrap">
    <p class="eyebrow">Next case study</p>
    <p class="t-title cs-next-title"><a href="{{NEXT_SLUG}}.html">{{NEXT_NAME}}</a></p>
    <a class="cs-prev-link" href="{{PREV_SLUG}}.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5.5 12.002H19"/><path d="M10.9999 18.002C10.9999 18.002 4.99998 13.583 4.99997 12.0019C4.99996 10.4208 11 6.00195 11 6.00195"/></svg>Previous case study</a>
    <div class="actions">
      <a class="cs-all-link" href="../work.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.88884 9.66294C4.39329 10 5.09552 10 6.49998 10C7.90445 10 8.60668 10 9.11113 9.66294C9.32951 9.51702 9.51701 9.32952 9.66292 9.11114C9.99998 8.60669 9.99998 7.90446 9.99998 6.5C9.99998 5.09554 9.99998 4.39331 9.66292 3.88886C9.51701 3.67048 9.32951 3.48298 9.11113 3.33706C8.60668 3 7.90445 3 6.49998 3C5.09552 3 4.39329 3 3.88884 3.33706C3.67046 3.48298 3.48296 3.67048 3.33705 3.88886C2.99998 4.39331 2.99998 5.09554 2.99998 6.5C2.99998 7.90446 2.99998 8.60669 3.33705 9.11114C3.48296 9.32952 3.67046 9.51702 3.88884 9.66294Z"/><path d="M14.8888 9.66294C15.3933 10 16.0955 10 17.5 10C18.9044 10 19.6067 10 20.1111 9.66294C20.3295 9.51702 20.517 9.32952 20.6629 9.11114C21 8.60669 21 7.90446 21 6.5C21 5.09554 21 4.39331 20.6629 3.88886C20.517 3.67048 20.3295 3.48298 20.1111 3.33706C19.6067 3 18.9044 3 17.5 3C16.0955 3 15.3933 3 14.8888 3.33706C14.6705 3.48298 14.483 3.67048 14.337 3.88886C14 4.39331 14 5.09554 14 6.5C14 7.90446 14 8.60669 14.337 9.11114C14.483 9.32952 14.6705 9.51702 14.8888 9.66294Z"/><path d="M3.88884 20.6629C4.39329 21 5.09552 21 6.49998 21C7.90445 21 8.60668 21 9.11113 20.6629C9.32951 20.517 9.51701 20.3295 9.66292 20.1111C9.99998 19.6067 9.99998 18.9045 9.99998 17.5C9.99998 16.0955 9.99998 15.3933 9.66292 14.8889C9.51701 14.6705 9.32951 14.483 9.11113 14.3371C8.60668 14 7.90445 14 6.49998 14C5.09552 14 4.39329 14 3.88884 14.3371C3.67046 14.483 3.48296 14.6705 3.33705 14.8889C2.99998 15.3933 2.99998 16.0955 2.99998 17.5C2.99998 18.9045 2.99998 19.6067 3.33705 20.1111C3.48296 20.3295 3.67046 20.517 3.88884 20.6629Z"/><path d="M14.8888 20.6629C15.3933 21 16.0955 21 17.5 21C18.9044 21 19.6067 21 20.1111 20.6629C20.3295 20.517 20.517 20.3295 20.6629 20.1111C21 19.6067 21 18.9045 21 17.5C21 16.0955 21 15.3933 20.6629 14.8889C20.517 14.6705 20.3295 14.483 20.1111 14.3371C19.6067 14 18.9044 14 17.5 14C16.0955 14 15.3933 14 14.8888 14.3371C14.6705 14.483 14.483 14.6705 14.337 14.8889C14 15.3933 14 16.0955 14 17.5C14 18.9045 14 19.6067 14.337 20.1111C14.483 20.3295 14.6705 20.517 14.8888 20.6629Z"/></svg>All work</a>
      <a class="btn btn-primary" data-link="email" href="#"><span class="icon-swap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6"/><path d="M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18.5 12L4.99997 12"/><path d="M13 18C13 18 19 13.5811 19 12C19 10.4188 13 6 13 6"/></svg></span>Contact me</a>
    </div>
    <footer>
      <span>© <span data-year></span> John DeSouza</span>
    </footer>
  </div>
</section>
```
