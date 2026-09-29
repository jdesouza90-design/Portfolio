# Working on john-desouza.com

Read README.md for how the site is built, and VOICE.md before writing any copy.
Never commit on `main`: Vercel deploys it on every push.

## Agent stack

The main session is the orchestrator and runs on Opus. The work goes to Sonnet subagents defined in
`.claude/agents/`. For any site task bigger than a one-line fix, follow the `orchestrate` skill
(`.claude/skills/orchestrate/SKILL.md`): scout, plan, branch, build, check, show John, deck sync,
ship, remember. Judgment stays with the orchestrator: design direction, copy claims and who did what,
what John sees, merge readiness and memory. Subagents never write memory.

`node .claude/qa/gate.mjs` is the definition of done for a branch. `sh .claude/qa/setup.sh` readies the
QA tooling in any checkout or worktree. Only one `deck-sync` and one `release-prep` agent run at a
time. The saved workflows in `.claude/workflows/` (`site-qa`, `voice-pass`, `deck-audit`) run only when
John asks for a workflow.

## Deck sync

John's interview deck mirrors this site. It is a Claude Artifact of the Slides type,
"John DeSouza — Strategic design, measured in business results":
https://claude.ai/artifact/VGcbxmLiVZPo1tD7tsdo5L

The site and the deck change together. A change to what a reader sees on the site is not
done until the matching slides say the same thing, in the same session. John should never
have to ask for the deck to be updated.

**The Vanta copy changes too, every time** (John, September 28, 2026). "John DeSouza ·
Vanta Portfolio", https://claude.ai/artifact/G3KAnpzqvxt9oKHVMyqt1w, is a 24-slide cut of
the main deck: cover, three `lead-` slides, `work-index`, the `nc-` and `ads-` runs and
`close`. Its headlines and copy are tailored and its speaker notes are John's talk track:
change only the lines that carry the site's wording, never the notes. It is shared with
anyone who has the link, so viewers see a publish at once. A plain `read` of its url
clears a "haven't viewed the latest version" refusal.

**What counts.** Copy, numbers, quotes, images and section order on the home page (the
hero, how I lead with its coaching columns, the three layers and the AI card, about, the
experience track, what colleagues said), the work index blurbs, and every case study page
under `work/`. **What doesn't.** CSS, motion, markup that changes nothing visible,
accessibility fixes, the blog and the admin pages.

**How.**
1. Artifact `list` with `scope: "files"` on the deck's url. Then `read` `project/deck.json`
   and every slide you will change. The deck's own `SKILL.md` sets the slide format; read it
   before a first edit.
2. Slide ids: `cover`, `for-company`, `lead-intro`, `lead-coaching`, `lead-ai`,
   `lead-layers`, `about`, `experience`, `kudos`, `work-index`, then one run per case
   study, prefixed `ads-` (agentic design system audit), `cs-` (Cross-Sell), `ver-`
   (Verifications), `refi-` (Refinance offers), `stk-` (Staking), `nc-` (No-code tools)
   and `siwe-` (Sign-in with Ethereum, hidden like its page). A run is the intro and the
   hero, then one slide per section of the page, in the page's order.
3. Match the site. Headings, eyebrows, numbers, quotes, names, who did what and section
   order are exactly what the site says, and quotes are never shortened. A slide may
   condense a long paragraph to fit, as long as it keeps every fact and adds none. Slides
   use the site's faces: Crimson Pro for headings and quotes, DM Sans for text, DM Mono for
   uppercase labels. Edit copies of the slides in one folder at their deck paths and
   publish them to the same url in one call. Add or remove a slide through `order` in
   `project/deck.json`, then renumber the footer page numbers and the start numbers on
   `work-index`. Images go up as assets first (`asset: true`).
4. Name the slides you changed in your final message, or say why none needed it.

**The hook.** `.claude/hooks/deck-sync.py` reminds a session when it edits a content page
and after each commit that changes one. It is registered in `.claude/settings.json` and,
on John's Mac, in his user settings too.

**No deck access?** If a session can't reach the deck (no Artifact tool), add a line to
`DECK-PENDING.md` at the repo root and commit it with the change:
`- <date> <commit>: <page>, <what changed>`. The next session on John's Mac sees the entries
when it starts, applies them to the deck and clears the file.
