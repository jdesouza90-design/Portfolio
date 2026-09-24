---
name: human-writing
description: >
  Audit and rewrite any content to sound like it was written by John — a real person — not an AI.
  Use this skill whenever the user asks to make content sound more human, less robotic, less AI-generated,
  or more natural. Also trigger when the user says things like "this sounds like ChatGPT," "too formal,"
  "too polished," "sounds fake," "bland," or asks you to "clean it up" or "make it sound like me."
  This skill works alongside john-voice and should be applied any time written output needs a human-sounding
  pass — even if john-voice was already used. Use it proactively when you notice AI-sounding patterns
  in content you've just generated.
---

# Human Writing — John's Voice

This skill audits and rewrites content to sound like it was written by a specific person, not a language model.

It layers on top of the `john-voice` skill. Read john-voice rules first if not already in context.

---

## The Core Problem

AI-generated writing has identifiable patterns. Even when rules are followed, output can still feel machine-produced due to:
- Uniform sentence length and cadence
- Structural predictability (always three points, always a conclusion)
- Filler transitions that exist to connect rather than to say something
- Over-completeness — answering every possible angle when one would do
- Perfect grammar where imperfection would be more natural

---

## AI Tell-Signs to Eliminate

### Phrase-level

Strip these on sight — they signal AI, not human:

| Pattern | Example | Fix |
|---|---|---|
| Throat-clearing openers | "It's worth noting that..." | Delete. Start with the point. |
| Hollow transitions | "With that in mind," / "That said," / "Building on this," | Delete or rewrite. |
| False urgency | "It's crucial to," / "It's essential that" | State the fact. Drop the flag. |
| Faux humility | "While there are many perspectives..." | Pick one and state it. |
| Redundant affirmations | "Absolutely," / "Great question," / "Certainly," | Delete. |
| Buzzword stacking | "leverage synergies to unlock value" | Rewrite with specifics. |
| Passive hedging | "It could be argued that," / "One might say" | Active: say it directly or don't say it. |
| Conclusion signaling | "In conclusion," / "To summarize," / "Ultimately," | Delete. Let the last sentence be the last sentence. |
| Over-inclusive lists | Listing 5 things when 2 would do | Cut to the ones that matter. |

### Structural patterns

- **Three-point everything.** Real writing doesn't default to three. Sometimes it's one point. Sometimes two. Cut to what's true.
- **Symmetrical paragraphs.** If every paragraph is the same length, the writing sounds generated. Vary deliberately.
- **The inevitable qualifier.** AI often adds "However, it's important to consider..." after making a point. Delete unless the counter-point materially changes the meaning.
- **Over-explanation.** AI explains what it just said in the next sentence. Cut the echo.

---

## Rhythm Rules

John's natural sentence rhythm: **short. medium. short.** Occasionally long when the idea earns it.

### Check sentence length distribution

After drafting, scan the sentence lengths. If more than three consecutive sentences are similar in length, rewrite for variation.

**Too uniform (AI pattern):**
> The design system reduced onboarding time by 34%. Engineers reported fewer implementation questions. Designers spent less time on spec handoffs. The pattern library covered 80% of use cases.

**Natural (human pattern):**
> The design system cut onboarding time by 34%. Engineers stopped asking how to implement components. The pattern library covered 80% of cases. Fewer handoff questions. Less rework.

### Punctuation for rhythm

- No dashes. Em dashes, en dashes, or hyphens in prose are off limits. Rewrite the sentence instead.
- Periods over semicolons. Semicolons slow the read.
- Fragments are fine when they land a point. Like this.
- Contractions: always. "Don't" not "do not." "It's" not "it is." Unless emphasis requires the full form.

---

## Naturalness Checks

Run these before finalizing any piece:

1. **Read it aloud (mentally).** Does it sound like something John would say in a meeting? If not, rewrite.
2. **Find the most AI-sounding sentence.** Rewrite just that one. Repeat once.
3. **Check the opener.** First sentence should drop you into the content, not introduce what you're about to say.
4. **Check the closer.** Should end on a fact, decision, or implication — not a summary or call to action unless one was asked for.
5. **Count the hedges.** If there are more than one per piece, cut the weakest ones.

---

## Rewrite Protocol

When given content to make more human:

1. Identify the AI tell-signs present (list them briefly to yourself, don't narrate to the user).
2. Rewrite — don't annotate. Deliver the clean version.
3. If major structural changes were made, note what changed in one line (e.g., "Cut the three-point structure and collapsed to two. Removed the summary paragraph.").
4. Do not explain every edit. Output the result.

---

## Examples

### Before (AI-generated)
> It's worth noting that our approach to the onboarding redesign was multifaceted. We leveraged user research, competitive analysis, and stakeholder alignment to ensure that the final design was both user-centered and business-aligned. Ultimately, this resulted in a 34% reduction in drop-off.

### After (John's voice, human)
> The onboarding redesign started with user research and a competitive review. We aligned on success metrics with stakeholders before design started. No post-hoc rationalization. Drop-off dropped 34%.

---

### Before (AI-generated)
> I'm excited to share that after months of hard work and collaboration across teams, we've successfully launched our new financial health dashboard. This incredible milestone represents our commitment to putting users first.

### After (John's voice, human)
> The financial health dashboard shipped. 65% of users in testing preferred it over competitors in the same category. Built with the product and data teams over two quarters.

---

## What This Skill Does Not Do

- Does not change factual content
- Does not add personality, humor, or warmth not already present in John's voice
- Does not rewrite correctly written content just to rewrite it — only fixes AI patterns
- Does not output before/after comparisons unless asked
