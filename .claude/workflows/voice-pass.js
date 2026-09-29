export const meta = {
  name: 'voice-pass',
  description: 'Audit every page\'s copy against VOICE.md, the AI-tells list and attribution, one copy-audit agent per page',
  whenToUse: 'Before sending the link out, after a copy-heavy round, or when John says the site sounds generated. Args (optional): { pages: ["work/staking.html", ...] }',
  phases: [{ title: 'Audit', detail: 'one copy-audit per page' }],
}

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
  agent(`Audit the copy on ${p}. Also grep the other pages for every number and claim on it and flag mismatches (card, work row, page).`,
    { label: `audit:${p}`, phase: 'Audit', agentType: 'copy-audit', schema: FINDINGS })
    .then((r) => r && { page: p, ...r })))

const done = audits.filter(Boolean)
const missed = PAGES.filter((p) => !done.some((d) => d.page === p))
if (missed.length) log(`not audited (agent failed or skipped): ${missed.join(', ')}`)
const findings = done.flatMap((d) => d.findings.map((f) => ({ page: d.page, ...f })))
log(`${findings.length} finding(s) across ${done.length} page(s); ${done.filter((d) => d.shipAsIs).length} page(s) fine as is`)
return { findings, pagesFine: done.filter((d) => d.shipAsIs).map((d) => d.page), missed }
