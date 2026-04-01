# Code Review Checklist and Deep Practices

## The Purpose of Code Review

Code review is NOT:
- A gatekeeping ritual
- A chance to show off knowledge
- An adversarial process

Code review IS:
- Knowledge sharing (both reviewer and author learn)
- Defect detection (especially design defects, not syntax)
- Quality assurance (consistency, readability, maintainability)
- Team alignment (everyone understands the codebase)

Source: Uncle Bob in "Clean Craftsmanship" Chapter 6, butunclebob.com on code review practices.

## Review Severity Levels

### Critical (Must Fix)
- Bugs: logic errors, null dereference, race conditions, off-by-one
- Security: injection, auth bypass, data exposure, hardcoded secrets
- Fundamental design violations: wrong abstraction, broken architecture boundary
- Data loss or corruption risk

### Warning (Should Fix)
- Missing tests for new behavior
- SOLID violations that will cause maintenance pain
- Naming that misleads or confuses
- Functions that are too long or do too many things
- Missing error handling
- Duplicated logic

### Suggestion (Consider Fixing)
- Style inconsistencies
- Minor naming improvements
- Opportunities for simplification
- Alternative approaches that might be cleaner
- Comments that could be replaced by better naming

## The Review Checklist

### Correctness
- [ ] Does the code do what it is supposed to do?
- [ ] Are edge cases handled (empty input, null, boundary values)?
- [ ] Are error conditions handled gracefully?
- [ ] Do the tests actually test the claimed behavior?

### Design (SOLID)
- [ ] SRP: Does each class/module have one reason to change?
- [ ] OCP: Can this be extended without modification?
- [ ] LSP: Can subtypes be substituted without breaking behavior?
- [ ] ISP: Are interfaces focused (no unused methods)?
- [ ] DIP: Are dependencies on abstractions, not concretions?

### Clean Code
- [ ] Are names intention-revealing?
- [ ] Are functions small and focused?
- [ ] Is there one level of abstraction per function?
- [ ] Are there any side effects?
- [ ] Is there dead code or commented-out code?
- [ ] Are comments necessary, or could better naming replace them?

### Testing
- [ ] Was this written test-first? (Can you tell from the test structure?)
- [ ] Do tests describe behavior, not implementation?
- [ ] Are test names clear about what they verify?
- [ ] Are test doubles used appropriately (not over-mocking)?
- [ ] Is there adequate coverage of edge cases?

### Architecture
- [ ] Do dependencies point inward (toward the domain)?
- [ ] Are framework dependencies isolated at the boundary?
- [ ] Is the domain layer free of infrastructure concerns?
- [ ] Are boundaries explicit and respected?

### Security
- [ ] Is input validated?
- [ ] Is output encoded appropriately?
- [ ] Are secrets kept out of code?
- [ ] Are auth/authz checks in place?

## How to Give Feedback

### Be Specific
Bad: "This function is confusing."
Good: "This function does three things: validates input, processes the order, and sends notification. SRP suggests splitting into three functions."

### Explain Why
Bad: "Rename this variable."
Good: "Rename `d` to `elapsedTimeInDays` -- the current name forces the reader to remember what `d` means (Clean Code Ch. 2: meaningful names)."

### Offer Alternatives
Bad: "This approach is wrong."
Good: "This couples the domain to the database. Consider injecting a repository interface instead (DIP)."

### Distinguish Severity
Always label your feedback: CRITICAL, WARNING, or SUGGESTION. The author needs to know which items are blocking.

### Praise Good Work
"This is a clean implementation. The naming is excellent and the test coverage is thorough." Positive feedback reinforces good practices.

## How to Receive Feedback

From Uncle Bob in "The Clean Coder" and "Clean Craftsmanship":

- **Do not take it personally.** The code is being reviewed, not you.
- **Assume good intent.** The reviewer wants the code to be better.
- **Fix critical and warning items without argument.** If a principle is violated, fix it.
- **Discuss, do not defend.** If you disagree, explain your reasoning. Be open to being wrong.
- **Thank the reviewer.** They invested time in making your code better.

## Review Timing

- Review within HOURS, not days. Stale reviews are expensive (context is lost).
- Small, frequent reviews > large, infrequent reviews.
- If a PR is too large to review in 30 minutes, it should have been split.

## Training Sources
- "Clean Craftsmanship" Chapter 6 -- Robert C. Martin
- "The Clean Coder" -- Robert C. Martin (on collaboration)
- Google's Code Review Guidelines (widely regarded as excellent)
- butunclebob.com -- posts on review as professional practice
- Micah Martin on review practices at 8th Light
- Conflicting: "Code review is too slow -- pairing replaces it." Response: pairing catches different issues than async review. The best teams do both.
