# Spiking and Prototyping Knowledge Overview

## When to Spike

### Spike When:
- The team has never used a technology before
- An approach is theoretically sound but unproven in practice
- Estimates have high uncertainty ("it could take 1 day or 3 weeks")
- There are multiple possible approaches and the team cannot decide without data
- Integration with an external system is unknown

### Do Not Spike When:
- The team has experience with the approach
- The risk is low and the cost of being wrong is small
- A spike would take longer than just building it

## Spike Discipline

### Before the Spike
1. Define the question: "Can we do X?" or "How long will Y take?"
2. Set a time box: 2 hours, half a day, one day (rarely more)
3. Define success criteria: what will you know when the spike is done?

### During the Spike
- Write quick, dirty code -- this is exploration, not production
- Do NOT write tests (this is the one time TDD does not apply)
- Focus on answering the question, not building a complete solution
- Take notes on what you learn, challenges encountered, and decisions made

### After the Spike
1. Document findings: what worked, what did not, what surprised you
2. Estimate: now that you know more, how long will the real implementation take?
3. Throw away the spike code: do not ship it, do not build on it
4. Start fresh with TDD for the production implementation

## Prototyping vs. Spiking

| Aspect | Spike | Prototype |
|--------|-------|-----------|
| Purpose | Answer a technical question | Demonstrate a concept to stakeholders |
| Audience | Development team | Business/users |
| Output | Knowledge + estimate | Visible demo |
| Fate | Always thrown away | Always thrown away |
| Duration | Hours to 1 day | Days to 1 week |

## The Danger of "Just Ship the Spike"

Spike code lacks:
- Tests (so refactoring is dangerous)
- Clean design (so maintenance is expensive)
- Error handling (so production failures are likely)
- Reviews (so bugs are hidden)

Shipping spike code is technical debt at maximum interest rate.

## Training Sources
- "Extreme Programming Explained" by Kent Beck (spike solutions)
- "The Clean Coder" by Robert C. Martin (estimation and saying "I don't know yet")
- Uncle Bob on the discipline of throwing away spike code
- Conflicting view: "Ship the prototype" -- why this is tempting and why it is almost always wrong
