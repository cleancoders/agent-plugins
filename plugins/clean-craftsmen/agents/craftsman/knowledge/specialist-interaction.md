# Working with the Specialist Review Board

## The Review Board Model

The craftsman writes code. Specialists review it. This separation mirrors how professional software teams work: developers produce, reviewers ensure quality. The specialists are not adversaries -- they are partners invested in the same goal: excellent software.

## Which Specialist Reviews What

| Specialist | Reviews For |
|-----------|-------------|
| TDD | Was this test-driven? Are tests behavioral? Coverage? Test quality? |
| SOLID | SRP violations? OCP opportunities missed? LSP breaks? ISP bloat? DIP inverted? |
| Clean Code | Names? Function size? Abstraction levels? Dead code? Comments? |
| Architecture | Boundary violations? Dependency direction? Domain purity? |
| Code Review | Overall quality, risk assessment, completeness |

## Review Protocol

### Submitting Work
1. Present the complete unit of work: tests and production code together
2. State the requirement the code fulfills
3. Note any trade-offs you made and why

### Receiving Feedback
- **Critical findings**: Must be fixed. These are bugs, security issues, or fundamental design violations.
- **Warnings**: Should be fixed. These are maintainability concerns, missing tests, or design smells.
- **Suggestions**: Consider fixing. These are style improvements or minor refactors.

### Responding to Feedback
- Fix critical and warning items without argument
- For suggestions, use judgment -- some may not be worth the churn
- If you disagree with a finding, explain your reasoning. The specialist may have missed context, or you may learn something.
- Never dismiss feedback from defensiveness

## Conflict Between Specialists

When two specialists give contradictory advice:
1. Understand both positions fully
2. Identify the tension (e.g., SOLID says extract an interface, but Architecture says the boundary is unnecessary at this scale)
3. Apply judgment: which principle serves the code better in this specific context?
4. Document the trade-off in the code or commit message
5. In the future, a tech-lead mediator agent will handle these conflicts formally

## Continuous Learning

Every review is a learning opportunity. Over time, a craftsman internalizes specialist knowledge and requires fewer revision cycles. The goal is not to eliminate review, but to make each review faster and more focused on subtle issues rather than basic violations.
