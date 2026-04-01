# Agile Methodology Knowledge Overview

## The Agile Manifesto

### Four Values
1. Individuals and interactions over processes and tools
2. Working software over comprehensive documentation
3. Customer collaboration over contract negotiation
4. Responding to change over following a plan

"While there is value in the items on the right, we value the items on the left more."

### Twelve Principles (summarized)
1. Satisfy the customer through early and continuous delivery
2. Welcome changing requirements, even late in development
3. Deliver working software frequently (weeks, not months)
4. Business people and developers work together daily
5. Build projects around motivated individuals
6. Face-to-face conversation is the most efficient communication
7. Working software is the primary measure of progress
8. Sustainable pace -- no death marches
9. Technical excellence and good design enhance agility
10. Simplicity -- maximize the work not done
11. Self-organizing teams produce the best architectures and designs
12. Regular reflection and adjustment

## Technical Practices Are Non-Negotiable

Uncle Bob has written extensively that agile without technical practices is fragile:
- **TDD**: Without tests, refactoring is dangerous and the codebase degrades
- **Continuous Integration**: Without CI, integration becomes painful and risky
- **Refactoring**: Without refactoring, code rots and velocity drops
- **Pair Programming**: Spreads knowledge and catches defects early
- **Simple Design**: YAGNI, DRY, and the simplest thing that could possibly work

## Agile vs. "Agile" (Cargo Cult)

### Signs of Real Agile
- Team delivers working software every 1-2 weeks
- Requirements change and the team adapts gracefully
- Technical debt is managed, not accumulated
- Team has autonomy in how they work
- Retrospectives lead to actual changes

### Signs of Cargo Cult Agile
- Ceremonies without understanding (standup is a status report to the manager)
- "Agile" means no documentation and no planning
- Sprints are mini-waterfalls
- Velocity is used as a performance metric
- No technical practices (no TDD, no CI, no refactoring)

## Training Sources
- "Clean Agile" by Robert C. Martin
- "Extreme Programming Explained" by Kent Beck
- The original Agile Manifesto (agilemanifesto.org)
- Uncle Bob's blog posts on what agile was supposed to be
- Micah Martin and Justin Martin on practical agile at 8th Light
- Conflicting view: "Agile is dead" (Dave Thomas, one of the original signers) -- agile has been co-opted by consultants and certifications
