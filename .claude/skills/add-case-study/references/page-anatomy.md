# Page anatomy

Every case study is the same document in the same order. This file lists each block, the
slot names it takes, the variants that exist, and the markup for each variant copied from a
live page. Use the snippets as they are; only the content changes. Anything not listed here
is not a pattern the site has, and adding one means adding CSS, so ask before inventing.

Contents
1. Conventions that apply everywhere
2. Hero
3. Results and the proof variants
4. How we got there: row types and their contents
5. My role
6. What I'd do differently
7. Next

---

## 1. Conventions that apply everywhere

- **Type roles.** Every heading and paragraph carries its role as a class: `.eyebrow`,
  `.t-display` (the h1), `.t-title` (section title), `.t-lede`, `.t-heading` (row or ledger
  heading), `.t-subhead` (column heading), `.t-body`, `.t-small`, `.t-stat`, `.t-quote`.
  Inline text (cells, cites, chips, buttons) gets its role from its component in
  `styles.css` section 2. Never set a font size, weight or line-height.
- **Images.** Always `decoding="async"`, `width`, `height` and `alt`. Everything below the
  hero also gets `loading="lazy"`; hero images don't. Paths are `../assets/<file>` with no
  `?v=` (stamp.py adds it). Width and height are the file's real pixels (from `webp.sh`).
- **Hero animation.** Only the hero's eyebrow, `h1` and lede carry `data-rise style="--i:N"`
  with N = 0, 1, 2. Nothing else on the page animates by attribute: every direct child of a
  section's `.wrap` rises into place on scroll by itself (48px over 700ms once its top
  crosses 70% of the viewport; see Motion in the README). Keep that structure, one block
  per child of `.wrap`, and never put `data-reveal` inside another `data-reveal`. Anything
  that plays inside a block (chart, `data-flow`, gauge) waits for the block's reveal on its
  own through `onceInView`.
- **Section ids** are stable across pages: `results`, `story`, `problem`, `design`,
  `decisions`, `research`, `role`, `retro`. Extra rows take a short id of their own
  (`feeds`, `community`, `customize`).
- **Inline styles** are only allowed for `--i` and `--crop-pos` (html-validate enforces it).
- **Icons** are inline SVG on a 24-unit viewBox, 1.5 stroke, `aria-hidden="true"`, ink with
  one accent detail: `class="ac"` on a stroked path or `class="ac-fill"` on a filled shape.
- **Arrows in prose** are not allowed (VOICE.md); `→` appears only inside `.flow-arrow`
  with `aria-hidden` and in the eyebrow term 0→1.
- **Quotes** keep the speaker's grammar. `<blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Label</b>Source</cite></blockquote>`.

---

## 2. Hero

Slots: `NAME` (twice: the breadcrumb's current item and the h1), `EYEBROW`, `LEDE`,
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
      <p class="eyebrow" data-rise style="--i:0">{{EYEBROW}}</p>
      <h1 class="t-display" data-rise style="--i:1">{{NAME}}</h1>
      <p class="t-lede" data-rise style="--i:2">{{LEDE}}</p>
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
| One wide illustration | `<figure class="panel hero-panel wide flat">` + one `img` (no shadow, no radius) |

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

Slots: `RESULTS_TITLE`, `RESULTS_LEDE`, `PROOF`.

```html
<section class="cs-section" id="results">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">Results</p>
      <h2 class="t-title">{{RESULTS_TITLE}}</h2>
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

**Comparison table** (A/B test, before/after). The wrapper is a labelled, focusable region
because it scrolls sideways on phones. The winning column carries `class="hl"`.
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

## 4. How we got there: row types and their contents

```html
<section class="cs-section" id="story">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">How we got there</p>
      <h2 class="t-title">{{STORY_TITLE}}</h2>
    </header>
    {{ROWS}}
  </div>
</section>
```

The story title is the arc in a fragment: "From a dead end to a second offer", "From a
progress bar to a checklist", "A wallet login that reads like any other".

Rows alternate. The pattern the pages use, in order: problem (`.row`), design (`.row.full`),
then any of decisions (`.row.full`), a second surface (`.row.flip`), research (`.row.flip`),
community (`.row.full`). Two rows minimum (problem and design); five is the most any page
has. Each row has one eyebrow, one heading and at most one short paragraph before its list
or visual. Split rows (`.row`, `.row.flip`) take `t-heading` + `t-body`; full-width rows
(`.row.full`) take `t-title` + `t-lede`.

**Row types**

| Class | Layout | Use |
|---|---|---|
| `.row` | copy left, fixed-height panel right | the problem, with a "before" screen |
| `.row.flip` | panel left, copy right | research quotes with a screen, a second surface |
| `.row.full` | copy on top, visual full width | galleries, flows, decision grids, walkthroughs, quote grids |

**Problem row** (always first; the tensions list is its signature):
```html
<article class="row" id="problem">
  <div class="row-copy">
    <p class="eyebrow">The problem</p>
    <h3 class="t-heading">{{PROBLEM_HEADING}}</h3>
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
Panel modifiers: `.panel.flat` for an illustration (no shadow), `.panel.wide` for a
landscape shot, `.panel.wide.crop` with `style="--crop-pos: 30% 0"` to show one corner of a
large screen at full scale, `.panel.cutout` for one UI card cut out of its screen with
transparent rounded corners (sharp `extract` + an SVG `dest-in` mask; see Refinance offers),
floating on the ground with a drop shadow that follows the alpha.

**Design row, gallery of three** (`.row.full`):
```html
<article class="row full" id="design">
  <div class="row-copy">
    <p class="eyebrow">The design</p>
    <h3 class="t-title">{{DESIGN_HEADING}}</h3>
    <p class="t-lede">{{DESIGN_BODY}}</p>
  </div>
  <div class="panel">
    <div class="gallery">
      <figure><img decoding="async" width="262" height="1200" src="../assets/ver-upload-list.webp" alt="Upload documents checklist: W-2, paystub, identification, 0 of 3 complete" loading="lazy"><figcaption>Document checklist</figcaption></figure>
      <figure><img decoding="async" width="239" height="1200" src="../assets/ver-w2-empty.webp" alt="W-2 upload screen with guidance and an empty state" loading="lazy"><figcaption>Per-document upload</figcaption></figure>
      <figure><img decoding="async" width="393" height="1200" src="../assets/ver-id-uploaded.webp" alt="Identification upload with a submitted file and accepted document types listed" loading="lazy"><figcaption>Submitted state</figcaption></figure>
    </div>
  </div>
</article>
```

**Design row, before/after flow** (`.row.full`, the `.flow-pair`). `.bad` marks the dead end,
`.new` marks the added steps. `four` on the second flow fits four steps.
```html
<div class="flow-pair">
  <div>
    <p class="flow-caption t-subhead">Before: a dead-end funnel</p>
    <div class="flow">
      <div class="flow-step"><img decoding="async" width="450" height="1200" src="../assets/cs-app-start.webp" alt="Application start: what are your needs?" loading="lazy"><span class="chip flow-label">Application</span></div>
      <div class="flow-arrow" aria-hidden="true">→</div>
      <div class="flow-step"><img decoding="async" width="450" height="1200" src="../assets/cs-checking.webp" alt="Checking your rates" loading="lazy"><span class="chip flow-label">Decisioning</span></div>
      <div class="flow-arrow" aria-hidden="true">→</div>
      <div class="flow-step bad"><img decoding="async" width="450" height="1200" src="../assets/cs-decline.webp" alt="Declined" loading="lazy"><span class="chip flow-label">Declined</span></div>
    </div>
  </div>
  <div>
    <p class="flow-caption t-subhead">After: a new path forward</p>
    <div class="flow four">
      <div class="flow-step"><img decoding="async" width="450" height="1200" src="../assets/cs-app-start.webp" alt="Application start" loading="lazy"><span class="chip flow-label">Application</span></div>
      <div class="flow-arrow" aria-hidden="true">→</div>
      <div class="flow-step"><img decoding="async" width="450" height="1200" src="../assets/cs-checking.webp" alt="Checking your rates" loading="lazy"><span class="chip flow-label">Decisioning</span></div>
      <div class="flow-arrow" aria-hidden="true">→</div>
      <div class="flow-step new"><img decoding="async" width="450" height="1200" src="../assets/cs-vehicle-details.webp" alt="Almost there, we just need a few details about your vehicle" loading="lazy"><span class="chip flow-label">Qualifying questions</span></div>
      <div class="flow-arrow" aria-hidden="true">→</div>
      <div class="flow-step new"><img decoding="async" width="450" height="1200" src="../assets/cs-offer.webp" alt="Congrats, you're approved for a secured loan" loading="lazy"><span class="chip flow-label">Offer</span></div>
    </div>
  </div>
</div>
```

**Design row, walkthrough** (`.row.full`). The poster is a `.jpg`; the animation loads on
Play. The note says what it is and, if it is over 3 MB, roughly how big.
```html
<div>
  <div class="walk">
    <img decoding="async" width="932" height="720" src="../assets/staking-walkthrough-poster.jpg" data-anim="../assets/staking-walkthrough.webp" alt="Walkthrough of the Chainlink Staking early-access flow" loading="lazy">
    <button class="btn btn-sm play" type="button" aria-pressed="false"><svg viewBox="0 0 12 14" fill="currentColor" aria-hidden="true"><path d="M11.2 6.13 1.6.24A1 1 0 0 0 .1 1.1v11.8a1 1 0 0 0 1.5.86l9.6-5.9a1 1 0 0 0 0-1.72Z"/></svg> <span>Play walkthrough</span></button>
  </div>
  <p class="walk-note">Screen recording of the v0.1 early-access flow.</p>
</div>
```

**Decisions row** (`.row.full` with `.cols`). Three columns, each an icon, a two-word `h4`,
one sentence, and a `.shot` figure: a crop of the real screen at native scale (480 to 750
wide, about 2:1), shown as the top-left corner of a framed card. This is the only
place the icon-over-heading grid appears on a case study; don't reuse it for role or retro.
```html
<article class="row full" id="decisions">
  <div class="row-copy">
    <p class="eyebrow">Design decisions</p>
    <h3 class="t-title">Three decisions inside the flow</h3>
  </div>
  <div class="cols">
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 18h10"/><path class="ac" d="M4 12h12"/></svg>
      <h4 class="t-subhead">Content strategy</h4>
      <p class="t-body">The copy moved from "Rejected" to "A different path".</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="750" height="400" src="../assets/cs-piece-copy.webp" alt="Almost there, we just need a few details about your vehicle, with a See vehicle requirements link" loading="lazy"></span></figure>
    </div>
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="7" rx="2"/><rect class="ac" x="3" y="14" width="18" height="7" rx="2" stroke-dasharray="3 2.5"/></svg>
      <h4 class="t-subhead">Progressive disclosure</h4>
      <p class="t-body">One idea per screen, with the detail behind "Learn more".</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="480" height="240" src="../assets/cs-piece-disclosure.webp" alt="Secured by your vehicle: borrow money based on your car's equity, without giving up the keys. Learn more" loading="lazy"></span></figure>
    </div>
    <div class="col">
      <svg class="col-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect class="ac-fill" x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>
      <h4 class="t-subhead">Consistent patterns</h4>
      <p class="t-body">Built from existing design system components, so the offer looks like the rest of the application.</p>
      <figure class="shot"><span class="shot-frame"><img decoding="async" width="480" height="260" src="../assets/cs-piece-offer.webp" alt="A Select offer button and a View loan summary link" loading="lazy"></span></figure>
    </div>
  </div>
</article>
```
Draw new icons in the same language: geometric, 24 viewBox, 1.5 stroke, rounded caps, one
accent element.

**Decisions row, stacked** (`.row` with `.tensions.stack` and a `.panel.cutout`). When the
decisions all live inside one card, stack them on the left as a hairline list (heading over
text, no icons) and float the card itself on the right. Refinance offers uses this.
```html
<article class="row" id="decisions">
  <div class="row-copy">
    <p class="eyebrow">Design decisions</p>
    <h3 class="t-heading">Three decisions inside the card</h3>
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
    <p class="eyebrow">What we heard</p>
    <h3 class="t-heading">Applicants asked for status, communication and cues</h3>
    <ul class="quote-list">
      <li><blockquote class="quote"><p class="t-quote">"If that 'in review' would've been maybe bigger or a different color, I would've noticed it earlier."</p><cite><b>Clear status badge</b>Usability session</cite></blockquote></li>
      <li><blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Communication</b>Usability session</cite></blockquote></li>
      <li><blockquote class="quote"><p class="t-quote">"…"</p><cite><b>Visual cues</b>Usability session</cite></blockquote></li>
    </ul>
  </div>
  <figure class="panel"><img decoding="async" width="376" height="1200" src="../assets/ver-thankyou.webp" alt="Thank you screen: you've successfully submitted your documents, you should hear from us in 1 to 3 business days" loading="lazy"></figure>
</article>
```
Eyebrow variants: "What we heard" (research), "What customers told us", "Community
reaction" (public posts; use the `.quotes` grid in a `.row.full` instead, as Staking does).

**Second-surface row** (`.row.flip` with a cropped wide panel):
```html
<article class="row flip" id="feeds">
  <div class="row-copy">
    <p class="eyebrow">Below the fold</p>
    <h3 class="t-heading">See what your stake secures</h3>
    <p class="t-body">Under the pool sit the data feeds it secures: each feed's latest answer, its node operators and whether each one responded.</p>
  </div>
  <figure class="panel wide crop" style="--crop-pos: 30% 0"><img decoding="async" width="1600" height="813" src="../assets/staking-feeds.webp" alt="Data feeds secured: ETH/USD feed details and node operator responses" loading="lazy"></figure>
</article>
```

---

## 5. My role

Three hairline ledger rows. The optional `t-lede` gives org context. Headings are the
labels from the interview; bodies are one to three sentences with "I" and "we" used
precisely.
```html
<section class="cs-section" id="role">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">My role</p>
      <h2 class="t-title">{{ROLE_TITLE}}</h2>
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
      <p class="eyebrow">What I'd do differently</p>
      <h2 class="t-title">{{RETRO_TITLE}}</h2>
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
`wiring.md` §5: the previous page is a bare left arrow with an `aria-label`, the next page
is its full name with a right arrow, both inside one `p.t-title.cs-next-title`. The SVGs
and the two buttons are copied from a live page; only the three slots change.
```html
<section class="cs-next">
  <div class="wrap">
    <p class="eyebrow">Next case study</p>
    <p class="t-title cs-next-title"><a class="cs-prev-link" href="{{PREV_SLUG}}.html" aria-label="Previous case study"><svg class="cs-next-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg></a><a href="{{NEXT_SLUG}}.html">{{NEXT_NAME}}<svg class="cs-next-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a></p>
    <div class="actions">
      <a class="btn btn-ghost btn-browse" href="../work.html">All work<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a>
      <a class="btn btn-primary" data-link="email" href="#"><span class="icon-swap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>Contact me</a>
    </div>
    <footer>
      <span>© <span data-year></span> John DeSouza</span>
    </footer>
  </div>
</section>
```
