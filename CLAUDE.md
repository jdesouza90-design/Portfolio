# Working on john-desouza.com

Read README.md for how the site is built, and VOICE.md before writing any copy.
Never commit on `main`: Vercel deploys it on every push.

## Deck sync

John's interview deck mirrors this site. It is a Claude Artifact of the Slides type,
"John DeSouza — Strategic design, measured in business results":
https://claude.ai/artifact/VGcbxmLiVZPo1tD7tsdo5L

The site and the deck change together. A change to what a reader sees on the site is not
done until the matching slides say the same thing, in the same session. John should never
have to ask for the deck to be updated.

**What counts.** Copy, numbers, quotes, images and section order on the home page (the
hero, how I lead with its coaching columns, the three layers and the AI card, about, the
experience track, what colleagues said), the work index blurbs, and every case study page
under `work/`. **What doesn't.** CSS, motion, markup that changes nothing visible,
accessibility fixes, the blog and the admin pages.

**How.**
1. Artifact `list` with `scope: "files"` on the deck's url. Then `read` `project/deck.json`
   and every slide you will change. The deck's own `SKILL.md` sets the slide format; read it
   before a first edit.
2. Slide ids: `cover`, `for-company`, `lead-intro`, `lead-coaching`, `lead-layers`,
   `lead-ai`, `about`, `experience`, `kudos`, `work-index`, then one run per case study,
   prefixed `ads-` (agentic design system audit), `cs-` (Cross-Sell), `ver-`
   (Verifications), `refi-` (Refinance offers), `stk-` (Staking), `nc-` (No-code tools)
   and `siwe-` (Sign-in with Ethereum): intro, hero, role, problem, design, quotes and
   results, plus a few extras.
3. Copy the site's wording verbatim. Edit copies of the slides in one folder at their deck
   paths and publish them to the same url in one call. Add or remove a slide through
   `order` in `project/deck.json`. Images go up as assets first (`asset: true`).
4. Name the slides you changed in your final message, or say why none needed it.

**The hook.** `.claude/hooks/deck-sync.py` reminds a session when it edits a content page
and after each commit that changes one. It is registered in `.claude/settings.json` and,
on John's Mac, in his user settings too.

**No deck access?** If a session can't reach the deck (no Artifact tool), add a line to
`DECK-PENDING.md` at the repo root and commit it with the change:
`- <date> <commit>: <page>, <what changed>`. The next session on John's Mac sees the entries
when it starts, applies them to the deck and clears the file.
