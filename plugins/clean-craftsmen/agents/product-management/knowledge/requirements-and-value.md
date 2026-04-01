# Requirements and Value Delivery

## Product vs. Project

- **Project management**: "Are we building it right?" (on time, on budget, as specified)
- **Product management**: "Are we building the right thing?" (valuable, needed, used)

Both are necessary. But building the wrong thing on time is worse than building the right thing late.

## User Stories

### Format
"As a [role], I want [capability], so that [benefit]."

### What Makes a Good Story
- **Independent**: Not dependent on other stories for implementation.
- **Negotiable**: Details are discussed, not dictated. The story is a conversation placeholder.
- **Valuable**: Delivers value to a user or the business.
- **Estimable**: The team can estimate the effort.
- **Small**: Completable in 1-3 days.
- **Testable**: You can write acceptance criteria for it.

(INVEST criteria, from Bill Wake)

### Acceptance Criteria
Every story needs acceptance criteria: the conditions that must be met for the story to be "done."

```
Story: As a customer, I want to apply a discount code at checkout.
Acceptance Criteria:
- Given a valid discount code, when applied, the total is reduced by the discount amount.
- Given an expired discount code, when applied, an error message is shown.
- Given a code already used by this customer, when applied, an error message is shown.
- Only one discount code can be applied per order.
```

These criteria become acceptance tests (see the Acceptance Testing agent's knowledge).

## Prioritization

### MoSCoW Method
- **Must have**: The system is useless without this. Non-negotiable.
- **Should have**: Important but the system works without it. High priority after musts.
- **Could have**: Nice to have. Include if time allows.
- **Won't have (this time)**: Explicitly excluded from this release.

### Value vs. Effort Matrix
Plot stories on a 2x2:
- High value, low effort: DO FIRST (quick wins)
- High value, high effort: DO NEXT (major features)
- Low value, low effort: DO IF TIME (nice-to-haves)
- Low value, high effort: DON'T DO (waste)

### Kano Model
- **Basic**: Expected. Absence causes dissatisfaction but presence does not delight. (Example: login works)
- **Performance**: More is better. Proportional to satisfaction. (Example: faster page load)
- **Excitement**: Unexpected. Absence is fine but presence delights. (Example: smart recommendations)

Build all basics first. Then invest in performance features. Sprinkle excitement features for differentiation.

## The Product Backlog

### What It Is
- An ordered list of everything the product might need.
- Ordered by priority (not just priority tagged -- actually ORDERED).
- The top of the backlog is refined (small stories, acceptance criteria, estimates).
- The bottom is rough (epics, ideas, future possibilities).

### Backlog Grooming
- Regular refinement sessions (weekly or per iteration).
- Break large items into smaller stories.
- Add acceptance criteria.
- Estimate.
- Re-prioritize based on new information.

### Definition of Done
The team's shared understanding of "done":
- Code written and peer-reviewed
- Tests written (unit, integration, acceptance)
- All tests passing
- Documentation updated (if applicable)
- Deployed to staging
- Demo-ready

If "done" means different things to different people, chaos follows.

## Working with Stakeholders

### Stakeholder Communication
- Demos every iteration (show working software, not slides).
- Transparent burndown/progress.
- Early warning when scope, time, or cost is at risk.
- "Bad news early" is a professional obligation.

### Managing Expectations
Uncle Bob in "The Clean Coder":
- "Don't promise what you can't deliver."
- "When the estimate and the deadline conflict, communicate."
- "Never say 'I'll try' when you mean 'I probably can't.'"

### Scope Negotiation
When there is more work than time:
1. Present the prioritized backlog with estimates.
2. Show what fits in the timeline.
3. Business decides what to cut or defer.
4. Development NEVER cuts quality (tests, clean code) to fit more scope.

## Training Sources
- "Clean Agile" -- Robert C. Martin (managing requirements, stakeholder communication)
- "User Stories Applied" -- Mike Cohn
- "Inspired" -- Marty Cagan (product management best practices)
- Micah Martin -- client collaboration and delivery at 8th Light
- Conflicting: "Product owners should just write detailed specifications." Response: detailed specs go stale. Conversations and working software are more reliable.
