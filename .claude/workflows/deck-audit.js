export const meta = {
  name: 'deck-audit',
  description: 'Compare the site against the main interview deck and the Vanta copy, slide run by slide run; read-only',
  whenToUse: 'When John wants to know whether the decks still match the site, or before an interview. Findings go to one deck-sync agent afterwards; this workflow never publishes.',
  phases: [{ title: 'Compare', detail: 'one reader per slide run' }],
}

const MAIN = 'https://claude.ai/artifact/VGcbxmLiVZPo1tD7tsdo5L'
const VANTA = 'https://claude.ai/artifact/G3KAnpzqvxt9oKHVMyqt1w'
const RUNS = [
  { deck: MAIN, prefix: 'cover, for-company, lead-intro, lead-coaching, lead-ai, lead-layers, about, experience, kudos', page: 'index.html' },
  { deck: MAIN, prefix: 'work-index', page: 'work.html' },
  { deck: MAIN, prefix: 'ads-', page: 'work/agentic-design-system-audit.html' },
  { deck: MAIN, prefix: 'cs-', page: 'work/cross-sell.html' },
  { deck: MAIN, prefix: 'ver-', page: 'work/verifications.html' },
  { deck: MAIN, prefix: 'refi-', page: 'work/refinance-offers.html' },
  { deck: MAIN, prefix: 'stk-', page: 'work/staking.html' },
  { deck: MAIN, prefix: 'nc-', page: 'work/no-code-tools.html' },
  { deck: VANTA, prefix: 'cover, lead-, work-index, nc-, ads-, close', page: 'index.html, work.html, work/no-code-tools.html, work/agentic-design-system-audit.html' },
]

const DIFFS = {
  type: 'object',
  properties: {
    mismatches: { type: 'array', items: { type: 'object', properties: {
      slide: { type: 'string' }, site: { type: 'string', description: 'file:line and the site text' },
      deck: { type: 'string', description: 'the slide text' }, kind: { type: 'string', enum: ['copy', 'number', 'quote', 'attribution', 'order', 'image', 'missing-slide', 'extra-slide'] },
    }, required: ['slide', 'site', 'deck', 'kind'] } },
    readError: { type: 'string' },
  },
  required: ['mismatches'],
}

const results = await parallel(RUNS.map((r, i) => () =>
  agent(
    `Read-only. Load the Artifact tool (ToolSearch select:Artifact). On ${r.deck}: list scope "files", read project/deck.json and the slides whose ids are ${r.prefix}. ` +
    `Compare them to the site's ${r.page} in this checkout under CLAUDE.md "Deck sync" rules: headings, eyebrows, numbers, quotes (never shortened), names, who did what and section order must match the site; a slide may condense a paragraph if it keeps every fact and adds none. ` +
    (r.deck === VANTA ? 'This is the Vanta copy: its headlines are tailored on purpose; only flag lines that carry the site\'s wording or a fact, never speaker notes. ' : '') +
    `Do not publish or edit anything. If the Artifact tool is unavailable, set readError.`,
    { label: `compare:${r.deck === VANTA ? 'vanta' : r.prefix.split(',')[0]}`, phase: 'Compare', schema: DIFFS })
    .then((x) => x && { run: r.prefix, deck: r.deck === VANTA ? 'vanta' : 'main', ...x })))

const done = results.filter(Boolean)
const errors = done.filter((d) => d.readError).map((d) => `${d.deck} ${d.run}: ${d.readError}`)
if (errors.length) log(`could not read: ${errors.join('; ')}`)
const mismatches = done.flatMap((d) => d.mismatches.map((m) => ({ deck: d.deck, ...m })))
log(`${mismatches.length} mismatch(es) across ${done.length} run(s)`)
return { mismatches, errors, unread: RUNS.length - done.length }
