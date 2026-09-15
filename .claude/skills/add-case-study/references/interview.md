# The interview

Eight rounds. Each question says which slot it fills (slot names match
`assets/case-study.template.html` and `page-anatomy.md`) and what a good answer looks like,
so you can tell when to move on and when to ask again. Send one round per message. Skip any
question the intake already answered, and say so ("I have the team and timeline from the deck").

The order is deliberate. Facts first because they are quick and warm John up. Outcome second
because the page leads with it and every later answer should point back at it. Assets and
placement last because they are mechanical.

---

## Round 1: The facts

Fills the hero eyebrow, the title, the four facts and the work-index chips.

1. **What is the project called, as the company writes it?**
   Slot: `NAME`. Also the `<title>`, the next-links and the index rows.
   Good: "Staking v0.1", "Cross-Sell: Vehicle Equity & Home Secured Loans". If it has an
   abbreviation, get both forms; the page spells it out on first use.

2. **Which company, which domain, and what kind of work was it?**
   Slot: `EYEBROW`, written as three parts with middle dots: "Best Egg · Consumer lending ·
   0→1". The third part is the shape of the work in two or three words: 0→1, Redesign + A/B
   test, New capability, Platform, Web3 login.

3. **What was your title at the time?**
   Slot: facts cell 1, `Role`. Exactly as it was, not the current title.

4. **Who was on the team?**
   Slot: facts cell 2, `Team`, and a chip. Count and seniority of the designers John directed
   ("2 designers", "4 senior designers"). If the interesting fact is the wider org ("global
   team of 7") or the partners ("Design, engineering and identity product"), that can be the
   cell instead. First names and roles only if named anywhere; no photos without asking.

5. **How long did it take, and when did it ship?**
   Slots: facts cell 3 (`Timeline`: "5 months") and cell 4. The fourth cell is whatever is
   most telling and its label changes with it: `Live` with dates, `Launched` with a month,
   `Scope` ("Discovery to A/B test"), `Validation` ("2 rounds of user testing"),
   `Delivery` ("Phased"), `Time zones` ("3"). Propose the label; don't ask John to pick one.

---

## Round 2: The outcome

Fills the outcome stat beside the title, the Results title and lede, the proof block and
the work-index blurb. This round decides whether the page has a number or a statement, so
take the time to get it right.

1. **What changed because of this work? If there is a number, what is it, what does it
   measure, and over what period?**
   Slot: `OUTCOME_STAT` and `OUTCOME_CAPTION`. Good: "$7.56M, new secured-loan originations,
   launch through February 2026". "25M LINK staked, pool full within 3 hours". The caption
   under the number says what it measures in one line, no verb needed.
   If John gives an adjective or a range, ask for the figure and the source. If there
   genuinely is none, go to question 4.

2. **Is that realized, or sized?**
   Decides the wording everywhere: "sized at", "opportunity" and "validated in an A/B test"
   for projections; plain past tense for realized results. Ask where the number comes from
   (finance, a dashboard, an A/B test, an ops estimate) so the page can say so. A sized
   number is fine on the page; a sized number presented as realized is not.

3. **What evidence can go on the page?** Use `AskUserQuestion`, multi-select:
   - *A series over time* (monthly originations, users per week) → the bar chart. Note: the
     chart formats values as US dollars, so a non-dollar series goes in a table instead.
   - *A before/after comparison or A/B result* → the comparison table.
   - *A fill or a time-to-target* (a pool filling, a queue clearing) → the capacity bar.
   - *Quotes* from users, developers or the public → the quotes grid.
   - *Nothing published* → the qualitative results block with "no published metrics" stated.
   Then get the data itself: the series values with labels and any milestone annotations
   (rollout dates), or the table rows, or the quotes.

4. **If there is no number: in one sentence, what could people do after that they couldn't
   before?**
   Slot: `OUTCOME_STATEMENT` (the heading-sized variant of the stat) and a `t-small` line
   saying "No published usage metrics" plus whatever validation there was.

5. **Quotes, if any: paste them verbatim. Who said each one, and where?**
   Slots: `QUOTE`, `QUOTE_LABEL`, `QUOTE_SOURCE`. Keep the speaker's grammar and emoji. The
   attribution is a short label (Product confusion, Clear status badge, or the person's name
   for public posts) and a source (Applicant interview, Usability session, @handle · date).
   Public posts need handle and date; private research needs the session type and no name.

---

## Round 3: The problem

Fills the problem row and the first sentence of the Results lede.

1. **What was broken? Name the screen or the moment.**
   Slots: `PROBLEM_HEADING`, `PROBLEM_BODY`. Good: "Once a file was sent, the dashboard went
   quiet. Nothing said whether it was pending, accepted or still needed, so applicants called
   to ask." Two sentences, the thing named, the consequence stated. If the answer is "the
   experience was confusing", ask what was on the screen and what people did next.

2. **What did it cost, the business or the people using it?**
   Slot: opens `RESULTS_LEDE`. "Best Egg's loan funnel ended at the decline." "Only an
   engineer could set up or change a login flow, so every branding tweak went into a queue."

3. **What three things did the design have to hold at once?**
   Slot: `TENSIONS`, three items, each a one-word label and one sentence with a subject.
   Offer the shapes the existing pages use so John can react rather than compose: Pivot /
   Trust / Business (Cross-Sell), Clarity / Trust / Growth (Staking), Access / Confidence /
   Control (No-code), Autonomy / Safety / Adoption (Sign-in with Ethereum). Two is acceptable;
   four means one is really a sub-point.

---

## Round 4: The design

Fills the design row and the optional story rows. Ask 1 and 2 always; ask 3 to 6 as a batch
and expect some to be "no".

1. **What shipped? Walk me through the screens in order.**
   Slots: `DESIGN_HEADING`, `DESIGN_BODY`, and it tells you which screens are the hero and
   which belong in the gallery or flow. Good: "Design B replaces the progress bar with a
   document-led checklist: one upload per document, format guidance, and a status the moment
   a file lands."

2. **Was there a before and after worth showing side by side?**
   If yes → the design row's `.gallery` runs the old screen first and the new ones after it,
   each figcaption starting "Before:" or "After:" (refinance-offers.html). Get which screen
   goes with each caption.

3. **Two or three decisions inside the flow that a hiring manager should notice?**
   Slot: `DECISIONS`, the three-column grid. Each is a two-word label, one sentence, and
   optionally the actual UI copy it produced (a heading, a button label) for the snippet.
   Content strategy, progressive disclosure and design-system reuse are the existing three;
   don't force the same three. Skip the grid if there's only one decision; put it in the
   design body instead.

4. **Is there a screen recording?**
   Slot: walkthrough block. Get the file, a one-line note for under it ("Screen recording of
   the v0.1 early-access flow"), and an alt for the poster.

5. **Anything below the fold or on a second surface worth its own row?**
   Slot: an extra `.row.flip`. Staking's "See what your stake secures" is the model: eyebrow,
   heading, one paragraph, one cropped screen.

6. **What did people say in research or testing?**
   Slot: research row with `.quote-list`. Same rules as round 2 quote 5. Three quotes is the
   pattern; the label on each is the theme the quote proves (Clear status badge,
   Communication, Visual cues).

---

## Round 5: My role

Fills the ledger. Hiring managers read this section closely, so precision about "I" and
"we" matters more here than anywhere.

1. **Three things you personally did on this project. For each: a two- or three-word label
   and one or two sentences.**
   Slot: `ROLE_ROWS`. Prompt with the three shapes that recur: the strategy or framework you
   set; how you ran the cross-functional work (who was in the room, what you decided there);
   how you developed the designers or held the quality bar. Good: "Both designers were running
   their own reviews with product, compliance and engineering by the end. I started the
   project directing and finished it coaching."
   Reject stacked verbs (coordinated, managed, facilitated, drove). Ask "what did you decide"
   and "what did the team ship" until each row has a subject and a specific.

2. **Is there org context a reader needs, in one sentence?**
   Slot: optional `ROLE_LEDE` under the section title. "At Auth0 I managed a team of seven
   senior designers across the US, Canada, France and Argentina. Two of them shipped No-code
   tools." Skip if the facts strip already says it.

3. **What is the section's heading?** Propose it from the three labels: "Framework,
   orchestration, coaching", "Alignment first, then design". Three nouns or a short clause.

---

## Round 6: What I'd do differently

Fills the retro note. Optional, and it should be.

1. **What didn't work, what would you sequence differently, and what held up?**
   Slot: `RETRO_ITEMS`, two or three, each a run-in label in bold and two or three sentences.
   The Cross-Sell retro is the model: a research-timing miss, a sequencing problem caused by
   org structure, and one thing that held (the design system investment). "I wish I'd tested
   more" is not a retro. A real decision that cost something is.
   If John has nothing he'd say out loud in an interview, drop the section.

---

## Round 7: Assets

Fills every `src`, `alt`, `width` and `height`.

1. **Where are the screens?** A folder path, a Figma link, or files in the chat. List what
   you find and ask which is which: the hero (one wide shot, or two or three phone screens),
   the problem screen (the "before"), the design screens (gallery of three, or the flow steps),
   the research screen (usually the "after" or a detail).
2. **Is there a recording?** GIF, webp or mp4, and a poster frame if John has one. Otherwise
   take the first frame.
3. **Which logo?** `assets/logo-bestegg.svg`, `logo-chainlink.svg` and `logo-auth0.svg`
   exist. A new company needs its own SVG wordmark from John, and a `.case-logo` height rule
   in `styles.css` so the wordmark text matches the others (they have different
   icon-to-text proportions).
4. **Alt text.** Draft it yourself from what the screen shows ("Upload documents checklist:
   W-2, paystub, identification, 0 of 3 complete") and confirm any product names.
   Illustrations get "Illustration of…"; decorative logos on index rows keep the company name
   as alt because they are the row's label.
5. **The thumbnail.** Which one piece of the design is the case study about? That piece is
   the index thumbnail, at reading size, not the whole screen shrunk to fit. Propose the
   composition from the table in `wiring.md` ("The thumbnail"): a card keyed out of its
   screen (`cutout`, `cutout bleed`) or a whole screen coming out of a corner (`emerge`,
   `wide emerge`). A screen that runs off the ground fades into it at the edges, so plan
   to run it off on purpose and keep the part that has to read clear of the fade band; a
   card that sits whole on the ground stays crisp. `AskUserQuestion`
   only if two compositions are genuinely open; otherwise say which one and why.

---

## Round 8: Placement

Fills the work-index position, the next-link ring, the homepage, and the ground.

1. **Where does it go in the order?** `AskUserQuestion` with the current order as options
   ("After Cross-Sell", "After Verifications", … "First"). This sets the row position in
   `work.html` and the next-case-study ring. Newest or strongest work tends to go first;
   the ring is what makes a reader who starts anywhere see everything.
2. **On the homepage?** The homepage shows four; `work.html` shows all. `AskUserQuestion`:
   add it as a fifth, replace one (which), or leave the homepage alone.
3. **The ground.** Every case study has a near-invisible pattern drawn from its subject
   (ruled lines for documents, concentric rings for a pool filling, a lattice for a canvas).
   Propose one motif in a phrase and a warm base tint from the palette family; John okays it.
   Recipe in `wiring.md`.
4. **Work-index blurb and chips.** Draft from rounds 1 and 2: one or two sentences, outcome
   first, plus one or two chips (the shape of the work, the team and timeline). Show them with
   the copy draft, not as a separate question.

---

## When John gives a brain dump instead

Sort everything he wrote into the slots above, then send one message: the slots you filled
(one line each, in his words where possible), the slots still empty, and only the questions
for the empty ones, grouped by round. Don't re-ask for anything he already said, and don't
ask about optional blocks the dump clearly doesn't support.
