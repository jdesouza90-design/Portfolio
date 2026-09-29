---
name: orchestrate
description: >
  How the main session (Opus) runs any piece of work on john-desouza.com with the Sonnet subagent
  stack in .claude/agents: plan, branch, fan out to builders, copy, QA and visual review, gate, show
  John, sync the decks, prepare the merge, remember. Use for every site task bigger than a one-line
  fix, including when John just says what he wants changed ("make the hero...", "fix the...", "add...",
  "QA the site", "rewrite the..."), and whenever work should be split across agents. The add-case-study
  and add-blog-post skills still own their own flows; this skill wraps them.
---

# Orchestrate a site change

The main session is the orchestrator and runs on Opus. It owns judgment: what to build, taste, copy
claims, attribution, what John sees, and merge readiness. Subagents run on Sonnet and own the volume:
finding, building, checking, capturing, syncing. **The orchestrator reads results and decides. It
doesn't hand its judgment to a subagent, and it doesn't do a subagent's legwork in its own context.**

## The stack

| Agent | Does | Edits | Parallel-safe |
|---|---|---|---|
| `site-scout` | Maps where a thing lives and what it touches | no | yes |
| `reference-scout` | Measures a reference site, maps it to our tokens | scratch only | yes |
| `site-builder` | Builds one planned change, runs the gate | branch | in its own worktree |
| `copy-editor` | Writes copy in John's voice, keeps facts exact | branch | one per page, in worktrees |
| `copy-audit` | Audits one page's copy | no | yes, one per page |
| `qa-runner` | Browser passes, triaged to confirmed bugs | scratch only | yes (own ports) |
| `visual-reviewer` | Screenshots and a design critique | no | yes |
| `asset-maker` | Higgsfield art, encoding, placement | branch | yes for candidates |
| `blog-writer` | One post through add-blog-post, stops before publish | branch | one per post |
| `deck-sync` | Main deck and the Vanta copy | the decks | **no, one at a time** |
| `release-prep` | Merge main in, restamp, gate, prepare the push | branch | **no, one at a time** |

The shared tooling is in `.claude/qa/` (`sh .claude/qa/setup.sh` makes it ready in any checkout or worktree): `gate.mjs` (the
definition of done), `static.mjs`, `motion.mjs`, `shots.mjs`, `voice-lint.mjs` and `prod-smoke.mjs`.
The saved workflows are in `.claude/workflows/`: `site-qa` (a full bug bash), `voice-pass` (a copy
audit of every page) and `deck-audit` (site against both decks). They run only when John asks for a
workflow.

## The loop

**1. Intake (Opus).** Restate the ask in one line. Settle anything that's John's to decide before
building. That covers design direction, what a claim says, and anything that changes what a hiring
manager reads. Past work sets defaults, so check memory: the hero originality bar, blurbs are one
line, team size per project, attribution, American spelling, no scroll locks on the home stack. Ask
only what memory and the code can't answer.

**2. Scout (Sonnet, parallel).** Send `site-scout` for the code map and `reference-scout` if John
named a site. Several scouts can run in one message. Read their maps and don't re-read their files.

**3. Plan (Opus).** Split the work into independent units that don't write the same file. `styles.css`
and `main.js` are shared: one builder per file per round, or give one builder the sequence. Decide
what goes to which agent, and write each brief so it stands alone. Each brief covers the goal, the
decision already made, the files and sections, what not to touch, and the done-check. A subagent
doesn't see this conversation.

**4. Branch.** Never work on `main`. Before touching git, check for peers: run `ListAgents`, `git
status` and `git worktree list`. Create the work's branch in its own worktree (`git worktree add
.claude/worktrees/<name> -b <name> main`, or `EnterWorktree`), and run `sh
.claude/qa/setup.sh` there. Builders that edit in parallel get `isolation: "worktree"` on their Agent call.
Each lands commits on its own branch, and the orchestrator merges those into the work branch.

**5. Build (Sonnet).** Send `site-builder`, `copy-editor` and `asset-maker` with their briefs,
independent units in one message. When a builder returns an open question, answer it (asking John if
it's his) and send the builder again with SendMessage so it keeps its context.

**6. Check (Sonnet, parallel).** In one message, send `qa-runner` on the pages touched,
`visual-reviewer` on what changed, and `copy-audit` on any page whose words changed. On a sitewide
CSS or JS change, split `qa-runner` by page group: home, work index plus cases, blog, admin.

**7. Judge (Opus).** Read the findings and decide what's real and worth fixing. Send fixes back to the
builder that made the change. Loop steps 5 to 7 until the gate passes and the reviews are clean.
`node .claude/qa/gate.mjs` passing on the work branch is the floor. It isn't the whole bar: design
quality and the claims are the orchestrator's call.

**8. Show John.** Send the one or two best screenshots (SendUserFile) or open a preview, with a short
description of what changed and what was decided. Before merging, John sees anything that changes
what a reader sees.

**9. Deck sync (Sonnet, one agent).** If a reader would see the change (CLAUDE.md "What counts"), send
`deck-sync` with the pages, the commit and the slide ids the builders named. Wait for it, and name the
slides it changed in your final message. If nothing needed it, say why.

**10. Ship.** Once John has seen it and stopped asking for changes, send `release-prep`. When it hands
back a push command because the harness refused the push, give John that exact command in a bash
block. After a push, confirm with `prod-smoke.mjs --expect`.

**11. Remember (Opus).** Write or update memory for decisions John made, approaches he rejected, and
traps that cost a round. Subagents never write memory. Remove worktrees you created once their
branches are merged.

## Routing by task

- **A copy change**: scout, then copy-editor, copy-audit, gate, show John, deck-sync, release.
- **A visual or motion change**: scout (plus reference-scout), then plan, site-builder, then qa-runner
  with motion and visual-reviewer, show John, release. Deck-sync only if images or copy changed.
- **A bug**: qa-runner to reproduce and localize, then site-builder to fix, then qa-runner again on
  that page.
- **A new case study**: follow the add-case-study skill. The interview and every copy approval stay
  with the orchestrator and John. Hand the build to site-builder, the assets to asset-maker and the
  checks to qa-runner and copy-audit. The deck runs through deck-sync.
- **A blog post**: blog-writer, then copy-audit, then the orchestrator reviews the argument against
  POSITION.md, then publish per the skill.
- **Sitewide QA**: qa-runner per page group in parallel. Or run the `site-qa` workflow when John asks
  for a workflow.
- **"Options" or "concepts" for John** (heroes, illustrations): generate several in parallel, from
  site-builder prototypes or asset-maker candidates. Put them in one comparison artifact, then wait
  for John's pick. Past rounds were rejected as unoriginal, so each concept starts from John's own
  vernacular and gets pitched in words before anything is built.

## What stays with Opus

- Taste, direction and anything John has rejected before (memory).
- **Claims.** Who did what, the numbers, what is realized and what is sized. Check every "I built" or
  "I led" against the page and memory before it ships.
- Conflict calls in merges beyond stamps.
- What John sees, and when the work is done.
- Memory.

Don't narrate the stack to John. Report outcomes: what changed, what was checked, what's live, and
the slides updated.
