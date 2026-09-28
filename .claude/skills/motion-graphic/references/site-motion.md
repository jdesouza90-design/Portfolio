# Site motion

Live motion on the pages of john-desouza.com. README.md "## Motion" is the source of truth
and describes every moving piece on the site; this file says where a new move goes and how to
check it. When the two disagree, the README wins, and fix this file.

Contents
1. Where each kind of move lives
2. Rules a new move keeps
3. Verify
4. Finish

---

## 1. Where each kind of move lives

| The move | Where it goes | Notes |
|---|---|---|
| A block rising into place as it scrolls in | nowhere: `main.js` tags every direct child of a section's `.wrap` with `data-reveal` | Put `data-reveal` on an element only to change the unit; its parent is then left alone. Nothing nests. |
| The hero's lines cascading on load | `data-rise style="--i:N"` on eyebrow, `h1`, lede | The hero only. "Nothing else animates by attribute." |
| Something inside a block that plays once the block is in | `onceInView(el, threshold, cb)` in `main.js` | It waits for the block's own `reveal` event. Never a new IntersectionObserver. |
| A hover, press or focus state | `styles.css`, on `--dur-press` 140 / `--dur-hover` 200 / `--dur-ui` 240 and `--ease` | Controls answer inside 200ms; nothing a user triggers runs past 300ms. |
| A headline number rolling in | `data-flow` on the `.t-stat` | Already built; it waits for the block. |
| A canvas ground that answers the cursor | a factory in `fields` in `main.js` returning `{ resize, frame }`, named in `data-field` beside a `canvas.field` | Draws at 30fps idle and 60 in play, only on screen, stops under the hero's pause button, draws one still frame under reduced motion, returns `false` from `frame` when still. Redraws on the `themechange` event. |
| A generative piece with a pause button | the pattern of the "AI in the process" art: a canvas drawn by `main.js`, an `.art-ctl` pause, a still SVG fallback drawn by a seeded script | The still is what reduced motion and no-JS readers see. |
| Something driven by scroll position | a CSS animation on `animation-timeline: scroll(root)` inside `@supports (animation-timeline: scroll())`, in section 9 | As the hero's field hand-off. Browsers without it get the still state. |
| Page to page | `@view-transition` and a `view-transition-name` | Case rows and heroes already carry `case-*` names; a new name must be unique on the page. |
| A rendered file (WebP) | the `.walk` markup, run by `initWalkthroughs` | Poster first, Play loads the file, a stop button returns the poster. See `rendered.md`. |

Read the block of `main.js` or `styles.css` you are extending before writing: each has a
comment that explains its choices, and a new move follows the neighbouring code's idiom.

## 2. Rules a new move keeps

- **Tokens, not numbers.** Durations and easings come from `:root` (`--dur-*`, `--ease*`,
  `--reveal-y`). A new token goes in `:root` beside the others with a comment saying what it
  is for, the way `--ease-settle` names the one thing that uses it.
- **Cheap properties.** Move `transform`, `translate`, `scale`, `opacity`, `clip-path`.
  Animating `width`, `height`, `top` or `margin` lays the page out again every frame.
- **Visible by default.** A hidden starting state belongs under `.anim` (the class the script
  adds once it can reveal), so a failed script never hides content.
- **Reduced motion.** The reveal is reset in section 9. Every other animation or transition
  carries its own `@media (prefers-reduced-motion: reduce)` rule next to it (see `.walk`,
  `.ba-lane`, `.agent-log`), ending on the settled state, not the first frame. JS checks
  the same media query before starting anything.
- **A pause for anything long.** Motion that runs more than 5 seconds beside other content
  gets a pause (WCAG 2.2.2): an `.art-ctl` button set up with `setPaused` in `main.js`.
- **Dark mode.** Colours are tokens, so CSS follows the theme. A canvas reads its colours
  from the tokens and redraws on `themechange`.
- **Waits for the block.** In-view work starts from `onceInView`, so it never plays before
  its block has risen.

## 3. Verify

Serve the site (`python3 -m http.server 4173 --bind 127.0.0.1`, or `node dev.mjs` for the
edge middleware), then watch the move slowed down. The Browser pane cannot show a reveal,
because a hidden pane paints no frames and the observers never fire; this can.

```bash
M=.claude/skills/motion-graphic/scripts
# the move at a tenth of its speed, at page-time milliseconds after the trigger
node $M/capture.mjs page http://127.0.0.1:4173/work/cross-sell.html <out> --scroll '#results' --at 0,100,200,350,500,700 --rate 0.1 --sheet
# reduced motion: every shot should be the settled state
node $M/capture.mjs page http://127.0.0.1:4173/work/cross-sell.html <out-reduced> --scroll '#results' --at 0,700 --reduced --sheet
# dark theme
node $M/capture.mjs page http://127.0.0.1:4173/work/cross-sell.html <out-dark> --scroll '#results' --at 0,700 --dark --sheet
```

`--hover SEL` and `--click SEL` trigger a state instead of a scroll; `--width` and `--height`
set the viewport (try 390×844 for a phone). `--rate` slows CSS animations and transitions
only; a canvas drawn from `requestAnimationFrame` runs at its own speed, so shoot it at
`--rate 1` with closer `--at` times.

Check on the sheet:
- the timings match the approved table (at rate 0.1, 100ms of page time is 1s of wall time,
  so a few milliseconds of jitter are normal);
- nothing a user triggers is still moving at 300ms;
- the reduced run shows the settled state at 0ms;
- the dark run has no paper-coloured patch or unreadable ink.

Then `npx html-validate` on the changed pages (the README's Accessibility section has the
command), and a keyboard pass on anything new that is focusable.

## 4. Finish

- Describe the move in README.md's "## Motion" section, in its manner: what moves, how far,
  how long, on which easing, what starts it, what reduced motion gets.
- `python3 stamp.py` if `main.js` or `styles.css` changed, so visitors get the new files.
- Deck: CSS and motion do not change the deck (CLAUDE.md, "What doesn't"). Say so in the
  report. A new image or rendered file on a content page does; see `rendered.md`.
