/* The deck's plan: one entry per slide, in order. Each entry says which
   layout draws it, pulls its content out of the site's pages (the model
   deck.js reads from index.html, work.html and the case studies, so a change
   on the site is a change here) and carries the speaker notes.

   Only what the site doesn't hold is written here: framing lines, takeaways,
   credit lines, the notes. Anything in [square brackets] is a gap to fill or
   a per-company line; the notes panel marks them.

   `skip: 'compressed'` drops a slide from the compressed path (the C key).
   `fills` are the per-company lines; a copy of this file per company changes
   them and the two case studies, nothing else. */
window.DECK_PLAN = {
  title: 'Portfolio presentation',
  minutes: 45,
  fills: {
    role: '',        // e.g. 'Director of Product Design'
    company: '',     // e.g. 'Acme Lending'
    date: '',        // e.g. 'October 2026'
    why: [],         // three or four reasons, per company
  },
  studies: { one: 'cross-sell', two: 'design-system-audit-agent' },

  slides: [

    // ---- Opening ----------------------------------------------------------

    {
      id: 'title', section: 'Opening', layout: 'title',
      content: (m, plan) => ({
        eyebrow: plan.title + (plan.fills.date ? ' · ' + plan.fills.date : ''),
        name: m.home.name,
        role: m.home.role,
        forLine: [plan.fills.role, plan.fills.company].filter(Boolean).join(', '),
        gap: plan.fills.role ? '' : '[Role and company: set in deck-plan.js per company]',
        portrait: m.home.portrait,
      }),
      notes: `[Per company. One sentence on why this role and this company. Name a real problem on their product and the thing you've already done next to it. Not "I'm excited to be here."]

Then: I'll show you two pieces of work. One where I set direction across two products that shipped on different calendars. One where I stayed close to the work and changed how the team finds out what's wrong with it. Then questions. Interrupt whenever you like, I've got a shorter path through each one.`,
    },

    {
      id: 'pov', section: 'Opening', layout: 'statement',
      content: (m) => ({
        eyebrow: m.home.lead.eyebrow || 'How I lead',
        heading: m.home.lead.heading,
        lede: m.home.lead.lede,
        points: m.home.lead.points,
        chain: m.home.layers.map((l) => l.name),
        chainNote: m.home.layersNote,
      }),
      notes: `Three parts. The first is the one people skip. If a team has to route every call through me, it stops scaling at one person. So the strategy has to be clear enough that a designer can make the call without me in the room. That's a writing job and a repetition job, and I do both.

The second is where my week actually goes. Weekly reviews, structured critique, time on specific work with specific people. I review against a standard, not my taste. Spacing, system usage, contrast, accessibility. If the bar is my taste, the team can't apply it when I'm not there.

The chain at the bottom is how I keep design honest. Craft moves behavior. Behavior moves the number the business already reports. Design answers to that number, not a parallel one we invented for ourselves. Every surface I own carries all three, so a decision can be traced end to end.

You'll see all of it in the first study. I set a framework, and by the end the two designers were running their own reviews with compliance in the room and me out of it.`,
    },

    {
      id: 'roadmap', section: 'Opening', layout: 'roadmap',
      content: (m, plan) => ({
        eyebrow: 'Two studies',
        heading: 'One on direction, one on craft.',
        items: [
          { ...m.caseCard(plan.studies.one), label: 'Case study one · Strategic vision',
            takeaway: 'How I set one framework and ran two products on separate calendars without owning every decision.' },
          { ...m.caseCard(plan.studies.two), label: 'Case study two · Execution and craft',
            takeaway: 'How I raised the bar by changing the method, and made the new standard something the team keeps without me.' },
        ],
      }),
      notes: `Two studies, both from Best Egg, both from the last 18 months.

The first is a strategy story. Please don't judge it on the screens. Judge it on whether the framework held across two products run by two different general managers.

The second is a craft story. Please don't judge it on the agent. Judge it on whether the standard is still standing without me in the loop.

I'll leave 10 minutes at the end. Let's go.`,
    },

    // ---- Case study one: Cross-Sell -------------------------------------------

    {
      id: 'cs1-title', section: 'Case study one', layout: 'case-title',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: 'Case study one · Strategic vision',
        title: c.title,
        frame: 'Best Egg’s funnel ended at the decline. Every declined applicant left with nothing, and so did Best Egg.',
        facts: c.factList,
        outcome: c.outcome,
        image: c.hero[0],
      }; },
      notes: `Best Egg is a consumer lender. The primary product is an unsecured personal loan. When an applicant doesn't qualify, the application ends. Before this work the end was a decline page and an offer from a third party partner. There was no path back into Best Egg.

Two secured products already existed, Vehicle Equity and Home Secured. Both could say yes to some of the people the personal loan says no to. Nobody had connected them to the decline.

So every decline was a lost applicant and a lost loan, after we'd already paid to get them to that page.

*Compressed path: fold the next slide in here with one line.* Two products, two general managers, two release calendars, two designers, and content, product, compliance and engineering on each.`,
    },

    {
      id: 'cs1-context', section: 'Case study one', layout: 'lanes', skip: 'compressed',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: 'Organizational context',
        heading: 'Two products, one design team across them.',
        body: c.role.row('Orchestration'),
        lanes: [
          { name: 'Vehicle Equity', items: ['Its own general manager', 'Its own roadmap and release calendar', 'Content, product, compliance and engineering', 'One designer'] },
          { name: 'Home Secured', items: ['Its own general manager', 'Its own roadmap and release calendar', 'Content, product, compliance and engineering', 'One designer'] },
        ],
        across: { name: 'Design, across both', body: 'One framework, one set of patterns, one weekly review with both products in the room. Run by me.' },
        constraints: [
          { label: 'Cadence', text: 'Separate release calendars, three months apart.' },
          { label: 'Scope', text: 'Each product scoped by a different general manager.' },
          { label: 'System', text: 'A design system that already existed. It matters later.' },
        ],
      }; },
      notes: `This is the shape that made it a director problem rather than a project. Two products, scoped by two general managers, on two roadmaps and two release calendars. Each one had its own content, product, compliance and engineering people. One designer on each.

If I'd let each product design its own decline experience, we'd have shipped two. The applicant doesn't know or care which business line declined them.

So my job was the thing across the lanes. One framework, one set of patterns, and a review rhythm that kept both products looking at the same work.

The design system already existed. That matters later.`,
    },

    {
      id: 'cs1-problem', section: 'Case study one', layout: 'problem',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: c.story.problem.eyebrow || 'The problem',
        heading: c.story.problem.heading,
        body: c.story.problem.body,
        tensions: c.story.problem.tensions,
        quotesHead: c.story.research.heading || 'What applicants told us',
        quotes: c.story.research.quotes,
        gap: '[If anything else had been tried before Cross-Sell, name it and why it didn’t work.]',
      }; },
      notes: `We interviewed declined applicants before design started. Three things came out.

They're angry. Not confused, angry. Somebody just told them no. So whatever comes next has to read as help, not as a catch.

They don't understand secured loans. One of them asked for a page that says this is not a title loan. If we lead with the collateral, we lose them.

And they want a person. Nobody was going to get a person at that point in the funnel, so the design had to do what the person would have done. Explain the benefits, in order, without a wall of text.

The business side is simpler. Every one of those applicants had cost money to acquire and left with nothing. So did we.`,
    },

    {
      id: 'cs1-direction', section: 'Case study one', layout: 'direction',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: 'The direction I set',
        call: 'The decline becomes a decision point, not an end state.',
        body: c.role.row('Strategic design'),
        rules: c.story.decisions.cols,
        gap: '[The option ruled out, and who was pushing for it.]',
      }; },
      notes: `The decision was to treat the decline as a redirect, and to write the rule once.

The rule covers two things. Where in the funnel a redirect is worth offering, and what it looks like when we do. That's the framework. The team applied it without me reviewing each decision, which was the point of writing it down.

What it cost: neither product got a decline experience tuned to itself. Both offers come from the same patterns, because the applicant sees one Best Egg, not two business lines.

[Who disagreed and how you handled it. If a general manager pushed for a product specific version, say so here. This is the slide panels use to tell a director from a senior IC.]

The third rule, build from the system, looked like a craft choice at the time. It turned out to be the thing that let the second product ship fast. I'll come back to it.

*Compressed path: the next slide is skipped. Say here:* one designer per product, one weekly review for both, Vehicle Equity first and Home Secured three months later on the same components.`,
    },

    {
      id: 'cs1-structure', section: 'Case study one', layout: 'timeline', skip: 'compressed',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: 'How I structured the work' + (c.facts.Timeline ? ' · ' + c.facts.Timeline : ''),
        heading: 'Three calls that mattered.',
        steps: [
          { when: 'First', what: 'Applicant interviews, before any design.' },
          { when: 'Then', what: 'The framework, written once for the whole funnel.' },
          { when: 'Build', what: 'One designer per product, inside that product’s own rituals.' },
          { when: 'Weekly', what: 'One design review for both products, run by me.' },
          { when: c.liveDates[0] || 'Launch 1', what: 'Vehicle Equity live. The redirect copy A/B tested after.' },
          { when: c.liveDates[1] || 'Launch 2', what: 'Home Secured live, on Vehicle Equity’s components.' },
        ],
        note: c.retro.note('Sequencing'),
      }; },
      notes: `Three process calls that mattered.

One, interviews before any design. That's where the anger and the title loan confusion came from, and it set the copy direction before we drew a screen.

Two, one designer per product, but one review for both. Each designer sat in their own product's meetings with their own product, compliance and engineering people. Once a week they came to a review I ran with both products in the room. That's the mechanism that kept the patterns shared. Without it the two lanes drift.

Three, ship Vehicle Equity first and let Home Secured inherit. Right order for the business. It also caused the rework I'll get to at the end.

The A/B test on the redirect copy came after the first launch. Hold that thought.`,
    },

    {
      id: 'cs1-pivot', section: 'Case study one', layout: 'before-after',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; const g = c.story.design.gallery; return {
        className: c.className,
        eyebrow: 'The key decision',
        heading: 'The offer has to read as help, not a catch.',
        line: c.story.decisions.col('Content strategy'),
        before: { label: 'Before', image: c.story.problem.image || c.hero[0], caption: 'The decline. A rejection and a partner offer.' },
        after: { label: 'After', image: (g[g.length - 1] || {}).img || c.hero[2], caption: (g[g.length - 1] || {}).caption || 'The secured loan offer' },
      }; },
      notes: `This is the decision that changed the trajectory. Everything on the page after the decline had to read as help.

That sounds soft. It isn't. It decided the copy, which moved from Rejected to A different path. It decided the order: questions first, offer second, so the applicant is answering, not being sold to. It decided the Learn more panel, which is where the collateral explanation lives, one tap away instead of on the main screen.

What we gave up was speed to the offer. A few screens where one would have been faster. For an angry applicant, faster isn't better.

We tested the redirect copy after launch instead of before, and iterated on it live. More on that in the retro.`,
    },

    {
      id: 'cs1-work', section: 'Case study one', layout: 'gallery',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: c.story.design.eyebrow || 'The work',
        heading: c.story.design.heading,
        lede: c.story.design.lede,
        figures: c.story.design.gallery,
        credit: 'Designed by [designer name], Vehicle Equity, and [designer name], Home Secured. Framework and weekly review: John DeSouza.',
      }; },
      notes: `Don't look at the visuals. Look at what each screen has to do.

The questions screen has to collect what the decision needs without feeling like a second application. One idea per screen.

The Learn more panel is doing the job the live person would have done. It's where this is not a title loan gets answered. It's behind a tap because most applicants don't need it, and the ones who do need all of it.

The offer is built from the same components as the rest of the application. Same card, same buttons, same disclosure pattern. Nothing on it says consolation prize.

What I did: the framework, the copy direction and the weekly review. What [name] and [name] did: every screen you're looking at, and the negotiation with compliance on each one.`,
    },

    {
      id: 'cs1-metrics', section: 'Case study one', layout: 'metrics',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: c.results.eyebrow || 'Results',
        heading: c.results.heading,
        stat: c.results.stat, label: c.results.label,
        table: c.results.table,
        tiers: [
          { name: 'Business', items: [c.results.lede] },
          { name: 'Applicant', items: ['A declined applicant now has a path back into Best Egg instead of a partner offer.', '[Take rate, completion, or the A/B result on the redirect copy.]'] },
          { name: 'Team and org', items: [c.role.row('People development'), c.retro.note('What held')] },
        ],
      }; },
      notes: `Back to the problem. Every declined applicant left with nothing. Over four months, $7.56 million of loans came from applicants who'd have left with nothing.

Read the ramp. October is two days, Vehicle Equity went to 100% on the 30th. Home Secured went to 100% on January 29, so February is the first full month with both products on. That's the jump.

[The applicant tier. Say what you know about take rate or completion, or say plainly that finance counts originations and the funnel step isn't published.]

The team outcome is the one I care about most. I started this project directing every review. By the end both designers were running their own with compliance in the room. That's the framework working. It was clear enough that they didn't need me to apply it.

And the second product shipped on the first product's components. Not one rebuilt.`,
    },

    {
      id: 'cs1-retro', section: 'Case study one', layout: 'retro',
      content: (m, plan) => { const c = m.cs[plan.studies.one]; return {
        className: c.className,
        eyebrow: c.retro.eyebrow || 'What I’d do differently',
        heading: c.retro.heading,
        notes: c.retro.notes,
      }; },
      notes: `Two real misses.

The copy test came after launch. I had strong qualitative signal going in and I let it stand in for a test. Some applicants saw copy we then changed. That's on me. Next time the redirect copy gets tested before the first product ships, not after.

Sequencing. I let two general managers scope two products, then tried to hold one pattern across them. It mostly worked, but Home Secured spent time reworking things Vehicle Equity had locked. The fix isn't a better review. It's scoping the applicant's journey first and letting the products fall out of it. That's a conversation with the general managers before there's a roadmap, and I'd push harder for it.

What held was the system. That investment was made months before anyone said Cross-Sell. It's why the second product shipped on the first one's parts.

That's the strategic one. The second study is closer to the work.`,
    },

    // ---- Case study two: the audit agent ------------------------------------

    {
      id: 'cs2-title', section: 'Case study two', layout: 'case-title',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: 'Case study two · Execution and craft',
        title: c.title,
        frame: 'One button component held 2,304 variants. Nobody could tell which one was right.',
        facts: c.factList,
        outcome: c.outcome,
        image: c.hero[0],
        wide: true,
      }; },
      notes: `Same team, same company, different kind of problem. The first study was about direction. This one is about what happens when the tools the team works with have quietly stopped meeting the bar.

The design system I just credited had a button component with 2,304 variants. It grew that way over years. Nobody made it that way on purpose.

This is a craft story, but the thing to watch is the method. I didn't fix the button. I changed how we find out what's wrong with a system, and then the team fixed the button.`,
    },

    {
      id: 'cs2-problem', section: 'Case study two', layout: 'problem',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: c.story.problem.eyebrow || 'The quality problem',
        heading: c.story.problem.heading,
        body: c.story.problem.body,
        tensions: c.story.problem.tensions,
        image: c.story.problem.image || c.hero[0],
        imageCaption: 'The old .Button, as the file held it.',
      }; },
      notes: `Seven properties that multiply. Style, color, size, icon, fixed width, state, theme. Every combination existed whether anyone used it or not. Most weren't used. A lot were near identical.

The cost wasn't the file. It was the decision. A designer picking a button made seven choices, and had no way to know if the result was one engineering had built. So people copied whatever was nearest.

I could see it was wrong. I couldn't prove how wrong, and neither could anyone else, because nobody can read 2,304 variants against every file in the product by hand. That's the actual problem. Not the button. The system had outgrown our ability to audit it.`,
    },

    {
      id: 'cs2-method', section: 'Case study two', layout: 'ledger',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: 'How I raised the bar',
        heading: c.role.heading,
        rows: c.role.rows,
        foot: 'Roles. John: the method, the brief, the coaching and the decision. [Designer name]: built the agent. [Designer name]: ran the passes and the component work.',
      }; },
      notes: `Three things I did, and one I didn't.

I chose the method. An agent, not a spreadsheet. That's a call about where the team's time goes. Counting is the agent's job. Deciding is ours.

I wrote the brief. Every file, every variant, every instance, flag what's unused or duplicated, and show the working. That last rule is the one that matters. An agent's count is a claim until you check it, so it had to show us where it looked.

I coached [name] through building it. How to brief it, how to read its list against the files, when to overrule it. Both designers ran it, so no single run was the truth.

What I didn't do is decide alone. We reviewed the list as a group and made the split together. Then the designers had the agent write the guideline to the calls we'd made, not the other way round.

*Compressed path: the next slide is skipped. Say here:* three components, booleans instead of variants for icons, and a library site that reads Figma every week.`,
    },

    {
      id: 'cs2-work', section: 'Case study two', layout: 'gallery', skip: 'compressed',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: c.story.design.eyebrow || 'The work',
        heading: c.story.design.heading,
        lede: c.story.design.lede,
        side: c.story.design.wide || c.hero[0],
        cols: c.story.design.cols,
        credit: '[Designer name] built the agent. The two designers ran the audit and had the agent write the guideline. Method and decisions: John DeSouza with the team.',
      }; },
      notes: `Three components where one did everything. Button, Icon Button and Link. The name tells you what it's for, so the first choice is the easy one.

The thing that took most of the variants out is booleans. In the old component, icon left was a variant, icon right was a variant, icon only was a variant, and each one multiplied everything else by four. Now the icons are toggles and the icon itself is a swap. They add nothing to the matrix.

Then the library, which is the next slide.`,
    },

    {
      id: 'cs2-library', section: 'Case study two', layout: 'gallery', skip: 'compressed',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; const l = c.story.library; return {
        className: c.className,
        eyebrow: l.eyebrow || 'The library',
        heading: l.heading || 'A design system site that updates itself',
        lede: l.lede,
        wide: l.poster,
        credit: 'The two designers had the agent build the site. It reads the component library in Figma and updates every week.',
      }; },
      notes: `This is the part that makes it repeatable. The audit isn't a project we did once. The site reads the Figma library every week and renders every component with its props, code and tokens, so drift is visible the week it happens.

One example of craft is a project. A standard that maintains itself is leadership. That's the difference I'm after.`,
    },

    {
      id: 'cs2-metrics', section: 'Case study two', layout: 'metrics',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: c.results.eyebrow || 'Results',
        heading: c.results.heading,
        stat: c.results.stat, label: c.results.label,
        table: c.results.table,
        tiers: [
          { name: 'Quality', items: [c.results.lede] },
          { name: 'Velocity and adoption', items: [c.role.row('The audience').split('. ').slice(1).join('. ') || 'New designers ramp on three components. Engineering can see the button styles. The library updates itself weekly.', '[Adoption across product files, time saved, or rework reduced.]'] },
          { name: 'Org', items: [c.role.row('The audience').split('. ')[0] + '.', 'Leadership asked for the same run on their own use cases.'] },
        ],
      }; },
      notes: `The 86% is the headline and it's the least interesting number.

The number I'd point at is four. Seven properties that multiplied became four, plus two toggles that don't. That's what stops the matrix growing back.

[Adoption and time saved. If you have a ramp time for a new designer or an engineering estimate, it goes here. If not, say the honest version: we didn't instrument adoption, and here's how I'd know it took.]

The org result is the one that tells you the method worked. I presented the audit to product leadership and then to the whole product org. What came back wasn't questions about buttons. It was other leaders asking for the same run on their own use cases. That's a standard leaving the design team and becoming a thing the company does.`,
    },

    {
      id: 'cs2-retro', section: 'Case study two', layout: 'retro',
      content: (m, plan) => { const c = m.cs[plan.studies.two]; return {
        className: c.className,
        eyebrow: c.retro.eyebrow || 'What I’d do differently',
        heading: c.retro.heading || 'A real miss, still to name.',
        notes: c.retro.notes,
        gap: '[The site leaves the retro off this study on purpose. The deck can’t. One or two real misses, the same shape as the Cross-Sell retro: the decision, what it cost, what you’d do instead. Two prompts: what did the group review get wrong on the first pass and have to reopen? Did engineering pick up the three components at the pace you expected?]',
      }; },
      notes: `[Write once the miss is chosen. Be direct. No false modesty. This slide separates candidates who reflect from candidates who perform.]

That's the two. Ninety seconds on what else is on the site, then why I'm here.`,
    },

    // ---- Closing --------------------------------------------------------------

    {
      id: 'sampler', section: 'Closing', layout: 'grid', skip: 'compressed',
      content: (m, plan) => ({
        eyebrow: 'Also on the site',
        heading: 'Four more, in one line each.',
        items: m.work.cases.filter((c) => c.slug !== plan.studies.one && c.slug !== plan.studies.two).slice(0, 4),
      }),
      notes: `Ninety seconds. Four more, and I'll go deep on any of them in questions.

Verifications is the one to ask about if you want another lending funnel story. Applicants uploaded documents and heard nothing, so they called. We replaced a misleading progress bar with a checklist per document and tested it before rollout. The 7,000 is sized, not realized, and I say so on the site too.

Refinance offers shipped this month. Seven weeks, no native flow, and the mobile funnel now shows the same offer the email does.

Staking is Chainlink. One designer across three time zones, and the pool filled in three hours.

No-code is Auth0. I made the case to leadership that no-code was a strategic gap and got a phased delivery. No published numbers on that one, so I won't claim any.`,
    },

    {
      id: 'why', section: 'Closing', layout: 'list',
      content: (m, plan) => ({
        eyebrow: 'Why here',
        heading: plan.fills.company ? 'Why ' + plan.fills.company + '.' : 'Why this role, not a title.',
        items: plan.fills.why.length ? plan.fills.why : [
          'A problem on their product I’ve already worked next to.',
          'How their design org is set up, and what I’d do with it.',
          'Where they are in their market, and why this role matters now.',
          'The thing they’re building that I’d want my name on.',
        ],
        gap: plan.fills.why.length ? '' : '[Per company. Three or four reasons, each tied to something specific. Not their features.]',
        close: m.home.contact.heading,
      }),
      notes: `[Per company. One minute. Say why this job, not why a Director title.]

Close: That's the deck. What do you want to pull on?`,
    },

    // ---- Appendix: added per company ----------------------------------------

    {
      id: 'appendix', section: 'Appendix', layout: 'divider',
      content: () => ({ eyebrow: 'Appendix', heading: 'Added when the role calls for it.', body: 'AI in the process for AI forward companies. The team timeline when the description leads with building a team. Compliance for lenders.' }),
      notes: `Nothing to say here. Skip past it unless one of the next three is in play.`,
    },

    {
      id: 'ai', section: 'Appendix', layout: 'statement',
      content: (m) => ({
        eyebrow: m.home.ai.eyebrow || 'AI in the process',
        heading: m.home.ai.heading,
        lede: m.home.ai.body[0],
        body: m.home.ai.body[1],
        tools: m.home.ai.tools,
      }),
      notes: `I'm deliberate about how it enters the process. AI moves faster than most tools do, so we adopt it on purpose and keep checking that it earns its place. The audit agent is the proof. It didn't replace a designer's judgment. It gave two designers a count they couldn't have made by hand, and they made the call. The point isn't to collapse the lines between design, product and engineering. It's to give all three a faster way to see the same thing.`,
    },

    {
      id: 'team', section: 'Appendix', layout: 'timeline',
      content: (m) => ({
        eyebrow: 'Teams led',
        heading: 'Four teams in six years.',
        steps: m.home.experience.map((e) => ({ when: e.dates, logo: e.logo, what: e.role, detail: [e.team, e.place].filter(Boolean).join(' · ') })),
        gap: '[Retention, hires made, promotions. The story is what each team could do when you left that it couldn’t when you arrived.]',
      }),
      notes: `[Write once the gap is filled. The story is what each team could do when you left that it couldn't when you arrived.]`,
    },

    {
      id: 'compliance', section: 'Appendix', layout: 'ledger',
      content: () => ({
        eyebrow: 'For lenders',
        heading: 'Compliance is a design input, not a sign off.',
        rows: [
          { title: 'In the room', body: 'Compliance sat in the weekly review for both Cross-Sell products. By the end the designers were negotiating each screen with compliance themselves.' },
          { title: 'One offer, every channel', body: 'On refinance offers, product, marketing and compliance agreed one rule: the offer in the email, the web funnel and the app is the same offer. A trust feature, agreed once.' },
          { title: 'Requirements first', body: 'On Verifications, product, engineering, compliance and operations agreed the requirements before design started, and the priorities held.' },
        ],
      }),
      notes: `Compliance is in the room every week, not at the end. On Cross-Sell that meant the designers were negotiating each screen with compliance themselves by the end of the project. On refinance it meant one rule: the offer in the email, the web funnel and the app is the same offer. That's a trust feature, and it came out of getting product, marketing and compliance to agree once instead of three times.`,
    },
  ],
};
