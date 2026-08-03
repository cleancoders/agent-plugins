# Cognitive & plain-language checks

Scoped to measurable heuristics plus the relevant AA/A criteria. Target: WCAG 2.2 AA. Two framing rules govern this file: subjective clarity is flagged **👀 verify manually** and is never auto-failed; reading level is reported as an **FYI, never a pass/fail gate**.

## Consistency & predictability
- [ ] Navigation appears in the same relative order across pages. (3.2.3)
- [ ] Components with the same function are labeled/named consistently across pages. (3.2.4)
- [ ] Help / contact mechanisms, when present, sit in a consistent location. (3.2.6 — new in 2.2)

## Sensory-independent instructions
- [ ] Instructions don't rely on shape, size, or position alone (e.g. "click the round button on the right" → name the control instead). (1.3.3)

## Plain-language heuristics (measurable)
Supports 3.1.3, 3.1.4, 3.1.5 — reported, not gated.
- [ ] Sentence length: flag long/complex sentences over a threshold.
- [ ] Abbreviations/acronyms: flag first use that isn't expanded or defined.
- [ ] Passive-voice density: flag high concentration.
- [ ] Reading level: compute and **report** a readability grade as an FYI (no pass/fail). (3.1.3, 3.1.4, 3.1.5 — reported)
- [ ] Clear CTAs / microcopy: buttons, errors, and instructions phrased as plain actions.

## Subjective clarity (manual-verify)
Flagged 👀 verify manually — never auto-failed.
- [ ] 👀 Is body copy actually understandable to a non-expert reader?
- [ ] 👀 Do error messages explain what happened and what to do next in plain terms?
- [ ] 👀 Are headings/labels genuinely descriptive of the content they introduce?
