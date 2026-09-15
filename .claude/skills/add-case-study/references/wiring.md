# Wiring a case study into the site

Everything outside `work/<slug>.html`, in the order to do it. `scripts/check.py` verifies
most of this afterwards, but it is quicker to get it right than to fix it.

Contents
1. Names
2. Assets
3. The work index (`work.html`)
4. The homepage (`index.html`)
5. The next-case-study ring
6. The ground in `styles.css`
7. A new company logo
8. The README
9. Stamp
10. The accessibility pass in the browser

---

## 1. Names

Three names, chosen once and used everywhere:

| Name | Form | Examples | Used for |
|---|---|---|---|
| Slug | kebab-case of the project name | `cross-sell`, `sign-in-with-ethereum` | `work/<slug>.html`, `og:url`, hrefs |
| Class | `case-` + a short form | `case-cross-sell`, `case-no-code`, `case-siwe` | `<body>` of the page, `.case-row` in both indexes, the ground rule in `styles.css` |
| Prefix | two to seven characters + `-` | `cs-`, `ver-`, `staking-`, `nocode-`, `siwe-` | every asset file |

The class and prefix may be shorter than the slug; the slug is never abbreviated.

---

## 2. Assets

Convert every screen to webp with the bundled script, which uses `sharp-cli` through `npx`
(no install; `sips` on this Mac cannot write webp). It prints the `width="…" height="…"`
pair to paste into the `img`.

```bash
.claude/skills/add-case-study/scripts/webp.sh "<source.png>" assets/<prefix>-<what>.webp [max-width]
```

Sizes the site uses:

| Kind | Max width | Existing examples |
|---|---|---|
| Phone screen | 450 | `cs-*.webp` are 450×1200; Verifications screens vary in width because they were cropped |
| Wide product shot | 1600 or 1800 | `staking-overview.webp` 1600×814, `nocode-customization.webp` 1800×839 |
| Illustration | as supplied, up to 1600 | `staking-illustration.webp` |
| Walkthrough poster | as the recording | `.jpg`, first frame of the recording |

Name files by what they show, not by their place on the page (`ver-upload-list`, not
`ver-design-2`), because the same screen is often reused: the hero screens reappear in the
problem and research rows, and in both indexes.

Walkthroughs: the animation is an animated webp (or a GIF converted to one) at
`<prefix>-walkthrough.webp`, the poster is `<prefix>-walkthrough-poster.jpg`. The existing
recordings are 2.8 to 8 MB and only load on Play; if a new one is over 3 MB, say so in the
`.walk-note`. If John still has the original screen recording, prefer it to a deck GIF; the
deck GIFs are capped at their export resolution.

Alt text says what the screen shows and what it says: the heading on the screen, the state
("0 of 3 complete", "with a submitted file"). A hero image alt can be a sentence. Never
"screenshot of".

Index thumbnails reuse hero screens; they take the same `width`/`height` and are `loading="lazy"`
in `work.html` and on the homepage except the first row's images.

---

## 3. The work index (`work.html`)

One `.case-row` per case study inside `.cases`, in the order John chose. The row is an `<a>`
with the case's class so it carries the case's ground and `data-reveal` so it rises in on
its own (see Motion in the README). Headings are `h2` here (the page's `h1` is the hero).

```html
<a class="case-row case-verifications" href="work/verifications.html" data-reveal>
  <div class="case-copy">
    <img decoding="async" class="case-logo" width="300" height="63" src="assets/logo-bestegg.svg" alt="Best Egg" loading="lazy">
    <h2>Verifications</h2>
    <p>Closed the loop after document upload: applicants can see their status instead of calling to ask. Sized at 7,000 fewer support calls a month and validated in an A/B test before rollout.</p>
    <div class="chips"><span class="chip">2 designers · 3 months</span></div>
    <span class="work-cta">Read the case study</span>
  </div>
  <div class="case-media">
    <img decoding="async" width="468" height="1200" src="assets/ver-step1.webp" alt="Verification step one: action required" loading="lazy">
    <img decoding="async" width="376" height="1200" src="assets/ver-thankyou.webp" alt="Documents submitted confirmation screen" loading="lazy">
  </div>
</a>
```

- Logo sizes: Best Egg `300×63`, Chainlink `234×42`, Auth0 `1164×344` (the intrinsic SVG
  sizes; CSS sets the rendered height).
- The blurb: one or two sentences, outcome first, past tense, the number if there is one.
- Chips: one or two. The shape of the work (`0→1`, `Web3 login`, `Phased delivery`) and
  the team and time (`2 designers · 5 months`, `4 senior designers · 3 time zones`).
- Media: `case-media` with two phone screens, or `case-media wide` with one landscape image.
- Paths here are `assets/…` (no `../`), because the index is at the root.

The hero lede on `work.html` says "The case studies are password protected"; it doesn't
mention a count, so it needs no change.

---

## 4. The homepage (`index.html`)

Same `.case-row` markup inside `#work .cases`, with `h3` instead of `h2` (the homepage's
section title is the `h2`). The homepage shows four rows today and ends with a "View all
work" button; adding a fifth is John's call (round 8). If he replaces a row, move the
replaced case's markup out rather than deleting it, so the blurb survives in `work.html`.

The homepage meta description names the companies ("Case studies from Best Egg, Chainlink
Labs and Auth0"); if the new case study is from a new company, add it there and in the
`og:description`.

---

## 5. The next-case-study ring

Each page's `.cs-next` links forward to the next page and back to the previous one, and
the last links forward to the first, so a reader who starts anywhere sees everything. The
next link is the page's full name with a right arrow; the previous link is a bare left
arrow with `aria-label="Previous case study"` (markup in `page-anatomy.md` §7). Today:

```
cross-sell → verifications → refinance-offers → staking → no-code-tools → sign-in-with-ethereum → cross-sell
```

Inserting a page after X means three pages change: the new page's `PREV_SLUG` is X and its
`NEXT_SLUG` is X's old next; X's next link now points to the new page; and X's old next
gets its `cs-prev-link` pointed back at the new page. Inserting first means the new page
sits between `sign-in-with-ethereum` and `cross-sell`: its prev is `sign-in-with-ethereum`,
its next is `cross-sell`, and those two pages' next and prev links move to the new page.
The next link's text is the full project name with `&amp;` escaped. Keep the ring in the
same order as `work.html`; `check.py` verifies both directions: the next links form a
single ring that covers every page, and every page's prev link points back at the page
whose next link points to it.

---

## 6. The ground in `styles.css`

Every case study has a ground: a base tint, a gradient and a near-invisible pattern drawn
from the project's subject. It is set by the `case-*` class on the page's `<body>` and on its
index rows, so the thumbnail and every panel inside the page share it. Add a rule at the end
of section 10, "Per-project grounds", with a comment that names the motif:

```css
.case-verifications {
  --panel-base: #E9E7D3;
  --panel: linear-gradient(155deg, #F1EFE0 0%, #DFDCC4 100%);
  /* ruled lines: a stack of documents waiting to be checked off */
  --panel-art: repeating-linear-gradient(180deg, rgba(20,16,12,.055) 0 1px, transparent 1px 24px);
}
```

The recipe:

- **Base and gradient** are warm. The palette is tan (ground `#F6F4F0`, ink `#14100C`), and
  the existing grounds sit inside that family: tan `#EFE8DB`, parchment `#E9E7D3`, clay
  `#EBE0D8`, sage `#E2E9DC`, warm grey `#E7E3DC`. Pick a tint the others don't use, keep it
  light enough that phone screens with white backgrounds still read as objects on it, and
  never drift cool (John rejected a cool-grey pass). The gradient runs `155deg` from a
  lighter tint of the base to a darker one, about 6% either side.
- **Pattern** is a `repeating-*-gradient` in `rgba(20,16,12, .035 to .06)`, one pixel
  wide, 24 to 42 px apart, or a small tiled SVG data URI (`--panel-size` = the tile) for
  anything a gradient can't draw. Ruled lines for documents, a radial for something
  filling, dots (`radial-gradient(... 1.2px, transparent 1.4px)` with `--panel-size: 28px
  28px`) for a canvas or grid, a plus mark per tile for a matrix, a dash per tile for a
  dotted line. Never cross two rulings: the diamond lattice that made was the one ground
  John rejected (Sep 2026). The motif should be explainable in the comment in one phrase.
- Copy the values from `main`'s `styles.css` when in doubt; that is where the warm set lives.

Contrast: the ground carries no text of its own, so it has no contrast requirement, but
`.flow-label`, `.gallery figcaption` and `.walk-note` sit on or near it. Run the axe pass.

---

## 7. A new company logo

Ask John for the company's own SVG wordmark (the existing three are the companies' vector
files, not redrawn). Save it as `assets/logo-<company>.svg`, use its intrinsic size as
`width`/`height` on the `img`, and add a height rule beside the existing ones in `styles.css`
so the wordmark's text is optically the same size as the others (each lockup has different
icon-to-text proportions, so the heights differ). On the index rows the logo alt is the
company name because it is the row's label.

---

## 8. The README

Two edits in `README.md`:

- The structure block lists every `work/*.html` with its company and name. Add the line in
  ring order.
- The line under `work.html` says "Work index: all five case studies", and the password
  section says "a visitor unlocks all five case studies once". Update both counts.

The "Case study skeleton" section describes the shape, not the instances, so it stays as it
is unless the new page introduced a variant (then describe the variant in one line).

---

## 9. Stamp

After the last edit to `styles.css`, `main.js` or anything in `assets/`, from the repo root:

```bash
python3 stamp.py
```

It rewrites every HTML page's `?v=` hashes for the CSS, JS, assets and favicons. The new
page's `src` attributes can be written without `?v=`; the script adds them. It only stamps
files that exist, so a typo in an asset path shows up as a `src` with no `?v=` (and
`check.py` reports the missing file).

If another session is editing the repo at the same time, `stamp.py` rewrites every page,
so coordinate before running it.

---

## 10. The accessibility pass in the browser

The bar is WCAG 2.2 AA with zero axe violations, which every other page meets. From memory
of what works in this environment:

1. `preview_start` with `{name: "portfolio"}` (a `python3 -m http.server` on 4173; no
   password gate locally). If a server is already listening on 4173 it may belong to another
   session; `navigate` to `http://127.0.0.1:4173/work/<slug>.html` works either way.
2. `javascript_tool`: `document.documentElement.classList.remove("anim")` so reveal-on-scroll
   doesn't leave sections transparent for the contrast check.
3. Inject axe: create a `<script src="https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js">`
   and await its load, then
   `await axe.run(document, {runOnly: {type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]}})`
   and return `violations.map(v => [v.id, v.impact, v.nodes.length, v.nodes[0].target])`.
4. `resize_window` to 375 and to `width: 320`, then check
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
5. If there's a walkthrough, `.click()` the Play button (the pane's synthetic Enter doesn't
   fire buttons) and confirm the `walk` gets `playing`.
6. Tab through the page once: the skip link, the nav, the table region if there is one, the
   Play button, the next link. Nothing should trap or vanish.
7. Screenshot the hero and the proof block for John. The pane's screenshots lag a beat after
   a programmatic scroll, so wait a second first.

Things that have failed before and how they were fixed: `--ink-3` text under 4.5:1 (use
`--ink-2` or `--ink`); a `<dl>` with the icon outside the `<dt>` (keep it inside); a table
that scrolls without a label (the `.table-wrap` region with `aria-label` and `tabindex="0"`);
an image with no `alt` (every image has one, decorative ones empty).
