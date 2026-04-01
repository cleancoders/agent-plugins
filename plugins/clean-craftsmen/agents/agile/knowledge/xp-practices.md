# Extreme Programming (XP) Practices

## The Core Practices

XP is the agile methodology that most closely aligns with software craftsmanship. Kent Beck created it; Uncle Bob adopted its technical practices as the foundation of professional development.

### Planning Game
- Business decides scope and priority. Development decides effort and technical consequences.
- Small stories: each representing a day or two of work.
- Velocity is a PLANNING tool, not a PERFORMANCE metric.

### Small Releases
- Release to production as frequently as possible. Weekly or daily.
- Each release is a complete, tested, valuable increment.
- "If it hurts, do it more often." Frequent releases make each one less risky.

### Simple Design
Four rules of simple design (Kent Beck, reinforced by Uncle Bob):
1. Passes all the tests
2. Reveals intention (expressive)
3. No duplication (DRY)
4. Fewest elements (no unnecessary classes, methods, or variables)

Corey Haines refined the order: tests pass, expresses intent, no duplication, minimal. These rules, applied in order, produce clean code.

### Test-Driven Development
- Write a failing test. Write minimum code to pass. Refactor.
- TDD is an XP practice. Uncle Bob made it the centerpiece of craftsmanship.
- Without TDD, refactoring is dangerous. Without refactoring, code rots. Without clean code, velocity drops.

### Pair Programming
- Two programmers, one keyboard. Driver and navigator.
- All production code is written in pairs (XP's original rule; relaxed in practice).
- Pairing spreads knowledge, catches defects, and produces better designs.

### Collective Code Ownership
- Anyone can change any code. No personal fiefdoms.
- Requires: comprehensive tests (so you can change safely), consistent style, pair programming (so everyone knows the codebase).

### Continuous Integration
- Integrate and run all tests multiple times per day.
- The build must be green at all times. A broken build is the team's #1 priority.
- This was revolutionary in 2000. It is table stakes now.

### Refactoring
- Continuously improve the design of existing code without changing its behavior.
- Martin Fowler's refactoring catalog provides the vocabulary.
- TDD makes refactoring safe. Refactoring makes TDD productive.

### Sustainable Pace
- 40-hour weeks. No overtime as a regular practice.
- Tired programmers write bugs. Bugs create more work. The cycle is vicious.
- "Work smarter, not longer" is not a platitude -- it is an engineering decision.

## The Feedback Loops

XP is built on feedback at every scale:

| Scale | Practice | Feedback Time |
|-------|----------|--------------|
| Seconds | TDD (red-green-refactor) | Immediate |
| Minutes | Pair programming | Real-time |
| Hours | Continuous integration | On commit |
| Days | Iteration planning | Daily standup |
| Weeks | Iteration demo | End of iteration |
| Months | Release planning | Each release |

Faster feedback = faster learning = fewer defects = higher velocity.

## XP Values

1. **Communication**: Pair programming, daily standups, customer on-site
2. **Simplicity**: Do the simplest thing that could possibly work
3. **Feedback**: TDD, CI, short iterations, customer demos
4. **Courage**: Refactor aggressively, say no to bad requirements, delete dead code
5. **Respect**: For the team, the customer, the code, and the craft

## XP and Uncle Bob

Uncle Bob has said: "If I could only recommend one methodology, it would be XP. It has the technical practices that agile needs."

The Clean Code Craftsmen system is essentially XP's technical practices decomposed into specialist agents:
- TDD agent = XP's TDD practice
- Pair Programming agent = XP's pairing practice
- Architecture agent = XP's simple design + metaphor
- Code Review agent = XP's collective ownership + continuous integration

## Training Sources
- "Extreme Programming Explained" (1st and 2nd edition) -- Kent Beck
- "Clean Agile" -- Robert C. Martin (XP through Uncle Bob's lens)
- "Clean Craftsmanship" -- Robert C. Martin (XP practices as disciplines)
- Kent Beck's blog and talks
- Conflicting: "XP is too rigid/extreme for real organizations" -- Uncle Bob's response: the practices are not extreme; doing them halfway is what's extreme (extremely risky).
