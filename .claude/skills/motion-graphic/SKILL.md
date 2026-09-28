---
name: motion-graphic
description: >
  Design, build and render motion for john-desouza.com and everything made from it: live
  CSS/JS motion on the site's pages (reveals, hover and press states, a stat that rolls in,
  a canvas piece, a scroll-driven hand-off, a view transition) and rendered motion files
  (an animated WebP with a poster for a case study, a 1:1 1080 MP4 for LinkedIn or X, an
  animated asset for the interview deck). Runs a brief, a storyboard of keyframe stills and a
  timing table for John's approval, then builds, renders frame by frame in headless Chrome,
  encodes, verifies and ships. Use this whenever John wants something to move, animate,
  loop, count up, draw in, transition or play: "animate this", "make a motion graphic",
  "a social clip of the Cross-Sell result", "an animated version for LinkedIn", "a gif of
  this", "a hero loop", "add a transition", "motion for the deck", "the stat should roll",
  even if he never says "motion". Not for encoding a screen recording someone already made
  (that is add-case-study's scripts/anim.py) and not for still images or charts.
---

# Motion graphics

Two kinds of work share one motion language:

- **Site motion**: CSS and JS that runs live on a page of the site. The rules already exist
  in README.md "## Motion"; the work is fitting a new move into them. Details:
  `references/site-motion.md`.
- **Rendered pieces**: a file made from an HTML scene that is rendered one frame at a time.
  The site gets an animated WebP and a poster JPEG behind a Play button; social gets a 1:1
  1080×1080 MP4; the deck gets the same files as assets. Details: `references/rendered.md`.

One request can need both (a stat that rolls on the case study and the same stat as a
LinkedIn clip). Say which path each part takes before the storyboard.

## Before anything

1. **Git.** Never commit on `main`: Vercel deploys every push. If `git status` shows edits you
   didn't make, another session is working here; use a worktree. Otherwise work on a branch.
2. **Read** README.md "## Motion" (both paths obey it) and VOICE.md if the piece carries
   words. For a site piece also read the page's markup around where it will sit.
3. **Tools.** Node 22 (its own `fetch` and `WebSocket` drive Chrome; nothing to install),
   Chrome or Chromium (the capture script finds it, or set `CHROME`), and PyAV with numpy for
   encoding, the same pair `add-case-study/scripts/anim.py` uses. If PyAV is missing (a cloud
   session), make a venv in the scratchpad and `pip install av numpy` there. Never add either
   to `package.json`: the site has no build step and Vercel installs that file.

## The motion language

What the site already does, so a new piece looks like it belongs. Anything outside this list
is new to the site: name it as new in the storyboard so John approves it knowingly.

| Move | How | Where it comes from |
|---|---|---|
| Rise | 48px for a block, 12px for a line of type; travel on `--ease-soft`, fade `linear`, both 700ms (`--dur-reveal`) | the scroll reveal, the hero cascade |
| Cascade | 60ms between blocks arriving together (capped at 240ms); 70ms between the hero's lines | `--reveal-i`, `data-rise --i` |
| Draw | a 1–3px accent seam or a stroke drawn over 500ms on `--ease` | the unlock sheet's seam |
| Roll | a number rolls in digit by digit, each digit a column of 0–9 behind a soft mask, lit from above with the accent | `data-flow` (the number flow) |
| Fade | opacity only, `linear` | the hero field hand-off, view transitions |
| Answer | a control responds inside 200ms; nothing a user triggers runs past 300ms | `--dur-press` 140, `--dur-hover` 200, `--dur-ui` 240 on `--ease` |

- **Easing** comes from the tokens: `--ease`, `--ease-soft`, `--ease-in-out`, and
  `--ease-settle` only for the phone menu's rows (the one overshoot on the site).
- **Colour** is the tokens: paper and ink, the green accent family. Rendered pieces use the
  light register, the same as the site's panels, which stay paper in dark mode.
- **Type** is the site's three faces: Crimson Pro for headings, stats and quotes (never bold),
  DM Sans for text, DM Mono for uppercase labels.
- **Words** in a motion piece are the site's words, verbatim: headings, numbers, names and
  quotes exactly as the page has them, quotes never shortened. New words go through
  VOICE.md and John approves them in the storyboard.
- **Access.** Under `prefers-reduced-motion` a piece is a still: the settled state or the
  poster. Anything that moves for more than 5 seconds beside other content has a pause
  (WCAG 2.2.2; the site's `.art-ctl` buttons). Nothing flashes more than 3 times a second.

## Workflow

### 1. Brief

Fill these from what John gave you; ask only for the gaps, a few questions at a time, in
order, each with the options you'd suggest:

1. Where it lives: which page and block, social (which network), the deck, or several.
2. The one thing it says (usually one number, one before/after, one flow).
3. The source: the page and element the words and numbers come from.
4. Length, and whether it loops (site) or plays once and holds (social).
5. For site motion: what starts it (load, the block's reveal, hover, click, scroll).

### 2. Storyboard (the gate)

Nothing is rendered in full, put on a page, or published until John approves this.

- **Rendered piece**: copy `assets/scene.template.html` to `motion/<slug>/scene.html`, lay out
  the frame, set each element's `--at`, and fill `beats` with the moments that matter. Then:
  ```bash
  node .claude/skills/motion-graphic/scripts/capture.mjs stills motion/<slug>/scene.html <scratch>/storyboard.png
  ```
- **Site motion**: write the timing table first. If the move is new to the site, mock it as a
  scene the same way and render stills; if it reuses a move above, the table is enough.

Show the stills sheet (send the PNG) and the timing table, one row per element:

| # | Element | Move | Starts | Lasts | Ease | Ends as |
|---|---|---|---|---|---|---|
| 1 | "Outcome" eyebrow | rise 12px | 0.40s | 0.70s | soft / linear fade | in place |
| 2 | accent seam | grow from left | 0.50s | 0.50s | ease | full width |

Add the total length, the loop or hold, the output files with their sizes in pixels, and
anything new to the site's language. Then stop and wait for approval or changes.

### 3. Build

- **Rendered**: finish the scene. `references/rendered.md` has the scene contract, sizes per
  destination, type scale for social, and what breaks frame-by-frame rendering. Open the
  scene file in a browser to preview it: it loops with a scrubber.
- **Site**: implement it where `references/site-motion.md` says that kind of move lives.

### 4. Render and encode (rendered pieces)

```bash
M=.claude/skills/motion-graphic/scripts
node $M/capture.mjs frames motion/<slug>/scene.html motion/<slug>/frames [--scale 2]
# site: WebP and poster straight into assets/
python3 $M/encode.py motion/<slug>/frames --fps 30 --webp assets/<prefix>-<name>.webp --poster assets/<prefix>-<name>-poster.jpg
# social: MP4 (and a poster for the custom thumbnail)
python3 $M/encode.py motion/<slug>/frames --fps 30 --mp4 motion/<slug>/out/<slug>-1080.mp4 --poster motion/<slug>/out/<slug>-poster.jpg
```
A site cut and a social cut differ in shape, so each is its own scene in the same folder
(`scene.html`, `scene-site.html`), with the same words and timing, rendered to its own frames folder.
`encode.py` prints one JSON line per file: size in bytes, frame counts, seconds.

### 5. Verify

- **Rendered**: `seconds` in the JSON equals the scene's `duration`; read the frame PNGs at
  each beat (`frames/<t × fps>.png`) and the poster, and compare them with the approved
  storyboard; sizes are inside the budgets in `references/rendered.md`.
- **Site**: `capture.mjs page` at `--rate 0.1` with `--sheet` shows the move slowed tenfold;
  run it again with `--reduced` (a still) and `--dark`. Then
  `npx html-validate` on the changed pages. `references/site-motion.md` has the list.

### 6. Ship

- **Site file**: `assets/<prefix>-<name>.webp` and `assets/<prefix>-<name>-poster.jpg` (the
  case study's asset prefix, e.g. `cs-`, `ver-`), placed with the `.walk` markup, then
  `python3 stamp.py`. Describe the new piece in README.md's Motion section, where every
  moving piece on the site is described.
- **Social**: the MP4 stays in `motion/<slug>/out/` (ignored by git; the scene re-renders it).
  Give John the path and the poster, which he can upload as the custom thumbnail.
- **Deck**: see "Deck" in `references/rendered.md`. A new image on a content page is a
  change the deck mirrors (CLAUDE.md "Deck sync"); CSS-only motion is not.
- **Commit** the scene (`motion/<slug>/scene.html`) with the files it made, on the branch.

### 7. Report

Name the files with their sizes and lengths, what was verified and how, what was not, and
the deck slides changed (or why none needed it).

## Files

- `assets/scene.template.html`: the scene every rendered piece starts from: tokens, faces,
  the motion vocabulary as classes (`.rise .fade .leave .draw .wipe .grow`), `tween` and the
  site's eases for JS, the `window.__motion` contract, and a looping preview.
- `scripts/capture.mjs`: `frames` (every frame of a scene), `stills` (the storyboard sheet),
  `page` (a live page slowed down, for site motion). The header lists every flag.
- `scripts/encode.py`: frames to animated WebP, H.264 MP4 and poster JPEG.
- `motion/cross-sell-outcome/scene.html` (repo root): a finished example, the Cross-Sell
  outcome stat as a 6-second 1:1 clip with the number flow done in `draw(t)`.
