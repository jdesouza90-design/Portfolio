export const meta = {
  name: 'voice-pass',
  description: 'Audit every page\'s copy against VOICE.md, the AI-tells list and attribution, one copy-audit agent per page',
  whenToUse: 'Before sending the link out, after a copy-heavy round, or when John says the site sounds generated. Args (optional): { pages: ["work/staking.html", ...] }',
  phases: [{ title: 'Audit', detail: 'one copy-audit per page' }],
}

// A session that started on a branch older than the agent stack has no .claude/agents, so the named
// agent type isn't registered and agent() throws. Fall back to a Sonnet general-purpose agent that
// reads the same definition and follows it.
const brief = (type) =>
  `You stand in for the "${type}" agent. Read its definition, .claude/agents/${type}.md, and follow the body (below the frontmatter) as your instructions. ` +
  `If this checkout has no .claude/agents it predates the agent stack: read it with \`git show main:.claude/agents/${type}.md\` instead.\n\n`
const run = (type, prompt, opts, extra = '') => agent(prompt, { ...opts, agentType: type }).catch((e) => {
  if (!/agent type .* not found/i.test(String((e && e.message) || e))) throw e
  log(`${type} is not registered in this session; ${opts.label} runs as a general-purpose agent reading its definition`)
  return agent(brief(type) + extra + prompt, { ...opts, agentType: 'general-purpose', model: 'sonnet' })
})

const PAGES = (args && args.pages) || [
  'index.html', 'work.html',
  'work/agentic-design-system-audit.html', 'work/cross-sell.html', 'work/verifications.html',
  'work/refinance-offers.html', 'work/staking.html', 'work/no-code-tools.html',
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      line: { type: 'string', description: 'file:line' }, rule: { type: 'string' }, text: { type: 'string' },
      rewrite: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['line', 'rule', 'text', 'confidence'] } },
    shipAsIs: { type: 'boolean' },
  },
  required: ['findings', 'shipAsIs'],
}

const audits = await parallel(PAGES.map((p) => () =>
  run('copy-audit', `Audit the copy on ${p}. Also grep the other pages for every number and claim on it and flag mismatches (card, work row, page).`,
    { label: `audit:${p}`, phase: 'Audit', schema: FINDINGS })
    .then((r) => r && { page: p, ...r })))

const done = audits.filter(Boolean)
const missed = PAGES.filter((p) => !done.some((d) => d.page === p))
if (missed.length) log(`not audited (agent failed or skipped): ${missed.join(', ')}`)
const findings = done.flatMap((d) => d.findings.map((f) => ({ page: d.page, ...f })))
log(`${findings.length} finding(s) across ${done.length} page(s); ${done.filter((d) => d.shipAsIs).length} page(s) fine as is`)
return { findings, pagesFine: done.filter((d) => d.shipAsIs).map((d) => d.page), missed }
