---
name: add-case-study
description: >
  Add a new case study to john-desouza.com, the static portfolio in this repo. Runs a
  structured interview (facts, outcome, problem, design, role, retro, assets, placement),
  drafts every piece of copy in the site's voice for approval, then builds work/<slug>.html
  on the shared skeleton and wires it into the work index, the homepage, the next-case-study
  ring, the per-project ground in styles.css, the README, the cache stamps and the
  accessibility checks. Use this whenever John wants to add, write, scaffold or "put up" a
  case study, project page or piece of work on the site, even if he only says "new project",
  "add the X work", "write up Y for the portfolio", or pastes notes or a folder of screens.
  Also use it to rebuild an existing case study from scratch. Not for the slide deck
  (that is case-study-builder) and not for editing copy on a page that already exists.
---

# Add a case study

A case study on this site is one HTML file plus seven small edits elsewhere. The file is easy;
the edits are where a rushed addition goes wrong (a broken next-link ring, a page with no
ground, an image with no size, stale hashes). This skill walks the whole thing in order so
that the sixth case study is as consistent as the first five, and the tenth as the sixth.

The three files that shape everything: `VOICE.md` (how copy is written), `README.md` (the
skeleton and the accessibility bar) and any existing `work/*.html` (the markup, live).
Read `VOICE.md` and the README's "Case study skeleton" and "Accessibility" sections before
the interview, because the questions are designed to pull out copy that fits them.

## Before the interview

1. **Git.** Never work on `main`, which deploys on push. Check for another session first
   (`git status` for edits you didn't make, `lsof -nP -iTCP:4173 -sTCP:LISTEN` for a dev server
   that isn't yours). If anything shows, work in a worktree; otherwise
   `git switch -c case-study/<slug> main`. Commit on the branch only, and don't merge.
2. **Intake.** Ask what John already has: notes, a deck outline (case-study-builder output),
   a Figma file, a folder of screens, a recording. Read all of it first and fill every slot
   you can, then show a short "have / still need" list and ask only for the gaps. John should
   never be asked for something he already gave you.
3. **Load the anatomy.** Read `references/page-anatomy.md` once so you know the slots the
   interview is filling and which variants exist. You will choose variants during the
   interview (chart vs table vs quotes, two phones vs one wide shot), and the choices are
   easier when you know what each one needs.

## The interview

Follow `references/interview.md`. It has eight rounds, and each question names the slot its
answer fills, so nothing is asked for its own sake. The shape of the interview matters:

- **One round per message.** Three to six questions grouped by section, not thirty questions
  at once and not one question per message. John can answer in a paragraph; you sort it into
  slots.
- **Closed choices go through `AskUserQuestion`** (proof type, hero panel shape, placement,
  homepage feature). Narrative answers come through chat.
- **Outcome before process.** The page leads with the result, so round 2 is the outcome, not
  the problem. If there is no number, get the one-sentence statement and say "no published
  metrics" on the page. Never invent, round or extrapolate a figure.
- **Push for the concrete thing.** When an answer is an adjective ("the flow was confusing"),
  ask what the screen showed and what people did. When it is a resume bullet ("coordinated
  design, product and compliance"), ask what John personally decided and what the team shipped.
  These follow-ups are what make the copy defensible; they are not optional politeness.
- **Skip what isn't there.** A retro with nothing honest in it is worse than no retro. A design
  decisions grid with one decision is worse than a sentence in the design row. Every optional
  block is optional.

## Draft the copy, then stop

Before touching HTML, write the whole page as copy, slot by slot, in one message: eyebrow,
title, lede, outcome stat and its caption, the four facts, results title and lede, every row's
eyebrow, heading and body, tensions, decisions, quotes with attributions, the three ledger rows,
the retro items, the meta description, the work-index blurb and chips, and the alt text for
every image. Label each slot so John can reply with "change the lede and the second tension".

Write it to `VOICE.md`: outcome first, headings under eight words, sentences under twenty,
"I" for decisions and "we" for what shipped, no em dashes, no serial comma, sentence case,
numerals from 10 up in prose, "sized" or "opportunity" for anything not realized. Read the
draft out loud in your head; a sentence John would not say across a table gets rewritten.

Wait for John's approval on the copy. Building the page first and editing copy inside HTML
afterwards is slower and leaves voice slips in.

## Prepare the assets

Names, sizes and conversion are in `references/wiring.md` ("Assets"). The short version:
pick a two-to-seven-character prefix for the project (`cs-`, `ver-`, `staking-`), convert
every screen to webp with `.claude/skills/add-case-study/scripts/webp.sh` (phone screens to 450 wide, wide shots to 1600
or 1800), and take the printed `width`/`height` into the markup. Every image gets an alt that
says what the screen shows, not "screenshot". Walkthroughs need a poster `.jpg` and a note
on size.

## Build the page

Copy `.claude/skills/add-case-study/assets/case-study.template.html` to `work/<slug>.html` and fill the `{{SLOTS}}`.
Delete the optional blocks you are not using, whole, comments included. Pull variant markup
(chart, A/B table, capacity bar, quotes grid, gallery, before/after flow, decisions grid,
walkthrough, cropped panel) from `references/page-anatomy.md`; the snippets there are copied
from live pages, so use them as they are and only change the content.

Then diff the new page's `<head>` boilerplate and `<header class="nav">` against
`work/verifications.html`. If the live site has moved on since the template was written, the
live page wins: fix the new page and update the template in the same commit so the next
addition starts from the right place.

## Wire it in

`references/wiring.md` lists every other file, in order: the work index row, the homepage row
(if John chose to feature it), the next-case-study ring, the `case-<slug>` ground in
`styles.css`, the README's structure list and page count, and `python3 stamp.py` last, after
the final CSS or JS edit, because the hashes go stale otherwise.

## Verify

Run `python3 .claude/skills/add-case-study/scripts/check.py` from the repo root. It checks the
things that break silently: the next-link ring, the ground class, image sizes and alts, lazy
loading below the hero, asset paths, nav and head drift, the README count, and then runs
`html-validate` on every page. Fix everything it reports.

Then the accessibility pass that only a browser can do: open the page in the Browser pane
(`preview_start` with the `portfolio` server), strip the `anim` class from `<html>` so
reveal-on-scroll doesn't hide text from the contrast check, inject axe-core from cdnjs and
run it with the WCAG 2.x A/AA and best-practice tags. Zero violations is the bar every other
page meets. Check the page at 375 and 320 wide for anything that scrolls sideways, and play
the walkthrough if there is one. Take a screenshot of the hero and the proof block for John.

## Hand off

Commit on the branch with a message that names the case study. Tell John what was added,
what he chose along the way (placement, homepage, proof type), anything you left out and why,
and that the branch is ready to merge when he wants it live. Don't push or merge.
