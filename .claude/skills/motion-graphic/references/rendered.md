# Rendered pieces

A rendered piece is an HTML scene turned into files: every frame is drawn from a time value
and screenshotted by headless Chrome, then encoded. Because a frame depends only on its time,
the render is exact at any length or frame rate, on any machine, and re-rendering after a
change is one command.

Contents
1. Where the files go
2. The scene contract
3. What breaks a frame-by-frame render
4. Sizes, lengths and budgets per destination
5. Encoding
6. Deck
7. Troubleshooting

---

## 1. Where the files go

| File | Path | In git |
|---|---|---|
| Scene (the source) | `motion/<slug>/scene.html`; a second shape of the same piece is `scene-<cut>.html` beside it | yes; re-render instead of editing an output |
| Frames | `motion/<slug>/frames/00000.png…` (`frames-<cut>/` for a second scene) | no (`.gitignore`) |
| Social and deck exports | `motion/<slug>/out/` | no; the scene rebuilds them |
| Site files | `assets/<prefix>-<name>.webp`, `assets/<prefix>-<name>-poster.jpg` | yes, stamped by `stamp.py` |

`motion/` is in `.vercelignore`: scenes are tooling, not pages. The slug is kebab-case and
names the message, not the format (`cross-sell-outcome`, not `cross-sell-linkedin`), so one
scene can feed the site, social and the deck.

## 2. The scene contract

Start from `assets/scene.template.html`. It sets `window.__motion`, which the capture
script drives:

```js
window.__motion = { width, height, duration, fps, beats, ready, seek(t) }
```

- `width`/`height` are the stage in CSS pixels; `capture.mjs --scale 2` doubles the output.
- `beats` is the storyboard: `[{ t: 0.9, label: "Seam drawn; digits rolling" }]`.
  `capture.mjs stills` renders one frame per beat and captions it.
- `seek(t)` pauses every CSS animation at `t` and calls `scene.draw(t)`.

Two ways to move things, freely mixed:

- **CSS keyframes** for DOM, type and SVG. The vocabulary classes take `--at` (the start, in
  seconds from the scene's start) and `--dur`: `.rise` (with `--y`, 48px for a block, 12px for
  a line), `.fade`, `.leave` (on a wrapper), `.draw` (a path with `pathLength="1"`), `.wipe`,
  `.grow` (with `--origin`). Write new keyframes the same way: `both` fill, a delay for the
  start. One element has one `animation` list, so an element that enters and leaves needs a
  wrapper for one of the two.
- **`draw(t)`** for what keyframes can't do: counting, the number flow, canvas, generative
  work. It builds the whole frame from `t` and keeps nothing between calls, so frame 140 can
  be drawn without frames 0–139. Helpers: `tween(t, at, dur, ease)` gives 0 before `at` and 1
  after `at + dur`; `ease.out`, `.soft`, `.inOut`, `.settle`, `.linear` are the site's curves;
  `lerp`, `clamp`. `motion/cross-sell-outcome/scene.html` builds the number flow this way.

Open the scene file in a browser to preview it: it loops in real time with a scrubber, and
Space pauses. The capture script adds `?capture`, which turns the preview off.

## 3. What breaks a frame-by-frame render

Anything that depends on the clock instead of `t` renders wrong, usually as a frozen or
jumping element:

- **CSS transitions.** They start on a state change, and `seek` cannot place them. Use
  keyframes.
- **`Date`, `performance.now()`, your own `requestAnimationFrame` loop, `setTimeout`.** Derive
  everything from `t`.
- **Unseeded randomness.** Use a seeded generator (the mulberry32 in `ai-process-art.mjs`),
  created inside `draw` or once at load, never advanced between frames.
- **Simulations that integrate step by step** (springs, particles). Use a closed form in `t`,
  or re-run the simulation from 0 to `t` on each call if it is short.
- **`<video>`, animated GIF or WebP inside a scene.** They play on their own clocks. Export the
  frames and draw them by index.
- **Images or fonts that haven't arrived.** `ready` waits for the three faces and every
  `<img>` in the document; an image added later must be decoded before the scene seeks.
  The faces are files in `assets/fonts/` (the ones Google Fonts serves the site, OFL), not a
  Google Fonts link: headless Chrome behind a proxy can fail to fetch them and would render
  in fallback faces. The script warns when a face is missing.

## 4. Sizes, lengths and budgets per destination

| Destination | Stage (CSS px) | `--scale` | Output | Length | Ends |
|---|---|---|---|---|---|
| Case study, `.walk` | 932 wide (the `.walk` maximum), height to suit | 2 (1.5 if over budget) | WebP + poster JPEG | 4–12 s | loops; last frame hands back to frame 0 cleanly or holds |
| Social, 1:1 | 1080 × 1080 | 1 | H.264 MP4, 30 fps | 6–15 s | plays once; holds the settled state 1.5 s or more |
| Deck | the slide region it fills | as the deck's SKILL.md says | WebP (or MP4) + poster | as short as it can be | holds |

**Site (`.walk`).** The box is 932px at most, rounded 16px, clipped, with a dark scrim over
the poster and the Play button over its centre until it plays. So: keep content 32px or more
from the edges, and make sure the poster still reads with a button over its middle. The
poster is what a reader sees before Play and under reduced motion, so it is the settled state
(the default, the last frame), and it carries the message on its own. Budget: under 2 MB
where possible; `add-case-study` asks the note under a walkthrough to give the size when it
is over 3 MB. The existing walkthroughs are 1.5 to 8.2 MB. The markup (from
`add-case-study/references/page-anatomy.md`):

```html
<div>
  <div class="walk">
    <img decoding="async" width="1864" height="1152" src="../assets/cs-outcome-poster.jpg" data-anim="../assets/cs-outcome.webp" alt="{{what it shows, as a sentence}}" loading="lazy">
    <button class="btn btn-sm play" type="button" aria-pressed="false"><svg viewBox="0 0 12 14" fill="currentColor" aria-hidden="true"><path d="M11.2 6.13 1.6.24A1 1 0 0 0 .1 1.1v11.8a1 1 0 0 0 1.5.86l9.6-5.9a1 1 0 0 0 0-1.72Z"/></svg> <span>Play animation</span></button>
  </div>
  <p class="walk-note t-small">{{what it is}}</p>
</div>
```

`width`/`height` are the file's pixel size, so the page reserves the right height before it
loads. Run `python3 stamp.py` after adding the files.

**Social (1:1 MP4).** A 1080 square shows at 360 to 550 CSS px in a feed, so set the site's
type roles at about twice their desktop size: labels 24–28px, body 36–44px, a stat 200px or
more, margins about 90px. X uses the first frame as the thumbnail, so frame 0 must be
composed (title and name standing), never an empty plate; LinkedIn takes a custom
thumbnail, so hand John the poster too. No audio track: feeds autoplay muted.

## 5. Encoding

```bash
python3 .claude/skills/motion-graphic/scripts/encode.py <frames> --fps 30 [flags]
```

| Flag | Default | Use |
|---|---|---|
| `--webp FILE` | | site and deck |
| `--quality N` | 80 | WebP quality; 70 if over budget, 90 for fine type on flat colour |
| `--threshold N` | 2 | per-channel change that counts as movement; rendered frames have no noise |
| `--loop N` | 0 | 0 loops forever (`.walk`); 1 plays once |
| `--mp4 FILE` | | social |
| `--crf N` | 18 | H.264 quality; lower is larger and cleaner |
| `--poster FILE` | | JPEG of one frame |
| `--poster-at S` | last frame | the time of the poster frame |

The WebP is muxed by hand, the way `add-case-study/scripts/anim.py` does it: only the box of
pixels that changed since the last frame is encoded, with no blending, so a hold costs
nothing and no earlier frame ghosts through. The MP4 is yuv420p, BT.709-tagged, faststart,
with no audio; the JSON says which encoder ran (`libx264`, else VideoToolbox, else `mpeg4`).

## 6. Deck

John's interview deck is a Claude Artifact (URL and slide ids in CLAUDE.md, "Deck sync").
When a rendered piece goes on a content page, the matching slide gets it in the same
session; a piece made for the deck alone goes the same way.

1. Artifact `list` with `scope: "files"` on the deck's url; `read` `project/deck.json`, the
   slide you will change, and the deck's own `SKILL.md` (it sets how a slide holds media).
2. Upload the file with `asset: true` to the deck's url and use the `url` the result returns.
   If the deck's SKILL.md has no place for an animated file, use the poster.
3. Edit a copy of the slide at its deck path and publish it to the same url; name the slide
   in the report.

No Artifact tool in the session: add `- <date> <commit>: <page>, <what changed>` to
`DECK-PENDING.md` and commit it with the change.

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| `No Chrome found` | set `CHROME` to the executable |
| `fonts did not load` | the scene is not at `motion/<slug>/scene.html`, so the `@font-face` paths to the skill's `assets/fonts/` miss |
| a frame is blank or unstyled | the scene seeks before `ready`, or an element starts hidden without a keyframe to show it |
| one element never moves | it uses a CSS transition, or a clock instead of `t` |
| everything is correct at beats but jumps between them | a value in `draw` depends on the previous call |
| WebP larger than expected | a full-frame change every frame (a moving background, grain, a gradient that shifts); keep the ground still, or lower `--quality` |
| MP4 colours look off beside the WebP | a player ignoring the BT.709 tag; check in a second player before changing anything |
