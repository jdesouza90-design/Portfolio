export const meta = {
  name: 'site-qa',
  description: 'Bug bash john-desouza.com: QA runners per page group, then a skeptic re-checks every bug',
  whenToUse: 'A full-site QA pass before sending the link out, after a sitewide CSS/JS change, or when John asks for a bug bash. Args (optional): { groups: [{ name, pages, interactions }], base }',
  phases: [
    { title: 'Sweep', detail: 'one qa-runner per page group: static, motion, interactions' },
    { title: 'Verify', detail: 'one skeptic per group tries to refute each bug' },
  ],
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
// With no .claude/qa here either, the scripts can't run in this checkout. Test this branch anyway from a
// detached worktree of HEAD with main's QA tooling copied in, one per group so the sweeps don't collide.
const tooling = (g, last) =>
  `If this checkout has no .claude/qa, test this branch from a scratch copy: \`git worktree add --detach .claude/worktrees/qa-${g} HEAD\` (reuse it if it exists), ` +
  `then \`git archive main .claude/qa | tar -x -C .claude/worktrees/qa-${g}\`, and run everything from that worktree. ` +
  (last ? `When you are done, remove it with \`git worktree remove --force .claude/worktrees/qa-${g}\`. ` : `If you find no bugs, remove it when you are done with \`git worktree remove --force .claude/worktrees/qa-${g}\`; otherwise leave it for the skeptic. `) + '\n\n'

const GROUPS = (args && args.groups) || [
  { name: 'home', pages: 'index.html', interactions: 'theme switch, layer tabs and Figure A rings, the lens, the kudos carousel, the palette (Cmd+K), the chat with its password step, Nine holes, the phone menu at 390, the featured stack, odometers' },
  { name: 'work', pages: 'work.html,work/', interactions: 'the gate (wrong password, then right) and the unlock opener, walkthrough Play, the Cross-Sell chart keyboard, the Staking gauge, the steps, the agent window, the sheets chart, Next case study ring, sticky work rows' },
  { name: 'blog-and-rest', pages: 'blog.html,404.html', interactions: 'blog search and view switch, the reading control, the 404 page links, and the admin dashboard at /admin/ (password admin): period control, filters, map, sessions table' },
]

const BUGS = {
  type: 'object',
  properties: {
    bugs: { type: 'array', items: { type: 'object', properties: {
      page: { type: 'string' }, where: { type: 'string', description: 'width/theme or interaction' },
      what: { type: 'string' }, expected: { type: 'string' }, locus: { type: 'string', description: 'selector or file:line' },
      repro: { type: 'string', description: 'exact command' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      preexisting: { type: 'boolean' },
    }, required: ['page', 'what', 'repro', 'severity'] } },
    flaky: { type: 'array', items: { type: 'string' } },
    reports: { type: 'array', items: { type: 'string' } },
  },
  required: ['bugs'],
}
const VERDICTS = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: {
    index: { type: 'number' }, real: { type: 'boolean' }, reason: { type: 'string' },
  }, required: ['index', 'real', 'reason'] } } },
  required: ['verdicts'],
}

const base = args && args.base ? ` Use --base ${args.base} on every script.` : ''

const results = await pipeline(
  GROUPS,
  (g) => run('qa-runner',
    `QA the "${g.name}" group of john-desouza.com in this checkout: pages ${g.pages}.${base} ` +
    `Run static.mjs (1440,390,320; light and dark) and motion.mjs on these pages, then script these interactions with lib.mjs: ${g.interactions}. ` +
    `Triage every failure against your known false-failure list and re-run each once before reporting it. Return confirmed bugs only.`,
    { label: `sweep:${g.name}`, phase: 'Sweep', schema: BUGS }, tooling(g.name, false)),
  (found, g) => {
    if (!found || !found.bugs.length) return { group: g.name, bugs: [], flaky: (found && found.flaky) || [], reports: (found && found.reports) || [] }
    const listed = found.bugs.map((b, i) => `${i}. [${b.severity}] ${b.page} ${b.where || ''}: ${b.what} (expected: ${b.expected || '?'}) repro: ${b.repro}`).join('\n')
    return run('qa-runner',
      `You are a skeptic. Another QA agent reported these bugs on john-desouza.com. For each, try to REFUTE it: ` +
      `reproduce it yourself from the repro command, check it against the known false failures (bot UA, view transition, smooth scroll, lazy images, live canvases, chat off in a worktree, Vercel analytics 404), ` +
      `and check README for whether the behavior is intended. Default to real=false if you cannot reproduce it.\n\n${listed}`,
      { label: `verify:${g.name}`, phase: 'Verify', schema: VERDICTS }, tooling(g.name, true))
      .then((v) => ({
        group: g.name,
        bugs: found.bugs.filter((b, i) => { const x = v && v.verdicts.find((d) => d.index === i); return x ? x.real : true }),
        refuted: found.bugs.filter((b, i) => { const x = v && v.verdicts.find((d) => d.index === i); return x && !x.real }).map((b) => b.what),
        flaky: found.flaky || [],
        reports: found.reports || [],
      }))
  },
)

const all = results.filter(Boolean)
const bugs = all.flatMap((r) => r.bugs.map((b) => ({ group: r.group, ...b })))
const order = { high: 0, medium: 1, low: 2 }
bugs.sort((a, b) => order[a.severity] - order[b.severity])
log(`${bugs.length} confirmed bug(s); ${all.reduce((n, r) => n + (r.refuted || []).length, 0)} refuted by the skeptics`)
return { bugs, refuted: all.flatMap((r) => r.refuted || []), flaky: all.flatMap((r) => r.flaky || []), reports: all.flatMap((r) => r.reports || []) }
