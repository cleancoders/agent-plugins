# Given-When-Then: Acceptance Test Structure

## The Format

Every acceptance test follows this structure:

```
GIVEN [precondition / system state]
WHEN [action / event]
THEN [expected outcome / observable result]
```

This is not merely a format -- it is a thinking tool. It forces you to think about:
- What state the system must be in before the test
- What exactly the user does
- What the system should do in response

Source: Dan North (BDD originator), adopted by Uncle Bob in "Clean Craftsmanship" Chapter 7.

## Writing Good Scenarios

### Be Specific About State
Bad: `Given a user`
Good: `Given a registered user with an active subscription`

### Actions Are User-Level
Bad: `When the database is queried`
Good: `When the user searches for "winter coats"`

### Outcomes Are Observable
Bad: `Then the cache is updated`
Good: `Then the search results show 15 winter coats sorted by relevance`

### Use AND for Multiple Conditions
```
Given a user with items in their cart
And the user has a 20% discount coupon
When the user applies the coupon at checkout
Then the total is reduced by 20%
And the coupon is marked as used
And the original prices are shown with strikethrough
```

## The Three Amigos

Acceptance tests should be written by three roles together (from BDD practice):

1. **Business** (Product Owner): defines WHAT the behavior should be
2. **Development**: defines HOW to make it testable and identifies edge cases
3. **Testing**: defines what COULD go wrong and identifies missing scenarios

This conversation is as valuable as the resulting tests. It surfaces misunderstandings early.

## Acceptance Tests as Specifications

From "Clean Craftsmanship" Chapter 7:

- Acceptance tests ARE the specification. They are executable requirements.
- If a requirement is not expressed as an acceptance test, it is ambiguous.
- The set of passing acceptance tests defines what the system does. No more, no less.
- When a bug is found, the first response is: "Why didn't we have an acceptance test for this?"

Uncle Bob: "Acceptance tests are the requirement document that never goes stale, because it is executable."

## Acceptance Test Automation

### Frameworks (Language-Agnostic Patterns)
- **Keyword-driven**: tests expressed in business keywords mapped to code (FitNesse, Robot Framework)
- **Gherkin-style**: Given/When/Then in `.feature` files mapped to step definitions (Cucumber pattern)
- **Code-based**: tests written in code but at the acceptance level (page objects, API clients)

### The Test Pyramid Position
- Acceptance tests sit above unit tests and below manual/exploratory testing.
- They are slower than unit tests but faster than manual testing.
- Aim for: many unit tests, some acceptance tests, few manual tests.
- Uncle Bob in "Clean Craftsmanship": acceptance tests should run in seconds to minutes, not hours.

## Anti-Patterns

### UI-Coupled Tests
- Tests that depend on button positions, CSS selectors, or pixel locations.
- These break when the UI changes, even if the behavior is unchanged.
- Fix: test through an API or abstract UI interaction behind page objects.

### Happy Path Only
- Only testing the success case.
- Fix: For every Given-When-Then, ask "What if the When fails? What if the Given is different?"

### Spec-After
- Writing acceptance tests after the feature is built, as regression tests.
- This misses the primary value: acceptance tests drive the design of the feature.
- Fix: write acceptance tests BEFORE or DURING implementation, not after.

### Implementation Leakage
- `Given the user record exists in the users table with id=42`
- This leaks database implementation into the test.
- Fix: `Given a registered user named "Alice"`

## FitNesse (Uncle Bob's Tool)

Uncle Bob created FitNesse, a wiki-based acceptance testing tool:
- Tests are written in wiki tables (business-readable)
- Fixtures (code) map wiki tables to system actions
- Tests run in the wiki and show green/red results
- Demonstrates the principle: acceptance tests should be READABLE by non-programmers.

## Training Sources
- "Clean Craftsmanship" Chapter 7 (primary on acceptance testing discipline)
- "Specification by Example" -- Gojko Adzic
- "The Cucumber Book" -- Matt Wynne & Aslak Hellesoy
- Dan North's original BDD articles
- butunclebob.com -- posts on FitNesse and acceptance testing
- Conflicting: "Acceptance tests are too expensive to maintain" (common pushback). Response: the cost of NOT having them is higher -- you discover bugs in production instead of in the build.
