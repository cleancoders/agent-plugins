# Pair Programming Knowledge Overview

## Pairing Patterns

### Driver-Navigator
- **Driver**: Controls the keyboard. Focuses on tactical decisions -- syntax, immediate implementation.
- **Navigator**: Thinks strategically. Watches for bugs, plans the next step, considers design.
- Switch roles frequently (every 15-30 minutes or after each TDD cycle).

### Ping-Pong Pairing (with TDD)
- Person A writes a failing test
- Person B makes it pass and writes the next failing test
- Person A makes it pass and writes the next failing test
- This creates a natural rhythm and ensures both partners engage with both tests and production code.

### Strong-Style Pairing
- "For an idea to go from your head into the computer, it MUST go through the other person's hands."
- The navigator dictates, the driver types. Forces communication.
- Especially useful for mentoring and knowledge transfer.

## When to Pair

### High-Value Pairing Situations
- Complex design decisions
- Unfamiliar codebases or technologies
- Onboarding new team members
- Critical or high-risk code
- When you are stuck

### When Solo May Be Better
- Trivial, mechanical tasks (renaming, formatting)
- Spike/exploration work where you need to think alone
- When both partners are fatigued

## Dynamics

### Skill Gaps
- Expert-novice pairing is valuable but requires patience
- The expert should let the novice drive more (strong-style)
- The novice should ask "why" freely -- this is how knowledge transfers
- Do not let the expert take over the keyboard out of impatience

### Disagreements
- Discuss, do not dictate. Try both approaches if time allows.
- "Let's try it your way for 10 minutes" resolves many disputes
- If stuck, take a break or bring in a third opinion

### Remote Pairing
- Use shared editors with real-time collaboration
- Keep video on -- non-verbal communication matters
- Take more frequent breaks (remote pairing is more tiring)

## Training Sources
- "Extreme Programming Explained" by Kent Beck
- "Clean Craftsmanship" by Robert C. Martin (pairing as professional discipline)
- Micah Martin and Justin Martin on pairing practices at 8th Light
- Conflicting view: "Pairing all the time is wasteful" (some Lean advocates) -- understand the counterargument
