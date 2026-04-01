# Acceptance Testing Knowledge Overview

## What Acceptance Tests Are

Acceptance tests verify that a feature works as specified from the business perspective. They are:
- Written in business language (not code jargon)
- Executable specifications of requirements
- The definition of "done" for a feature
- Automated and part of the CI pipeline

## Given-When-Then Structure

```
Given: the preconditions (system state before the action)
When: the action the user takes
Then: the expected outcome
```

### Example
```
Given a user with a valid account
And the user has items in their cart
When the user clicks "Checkout"
Then an order is created with the cart items
And the user receives a confirmation email
And the cart is emptied
```

## Acceptance Tests vs. Other Tests

| Aspect | Unit Tests | Acceptance Tests |
|--------|-----------|-----------------|
| Scope | Single function/class | Entire feature |
| Language | Code | Business |
| Author | Developer | Developer + Stakeholder |
| Speed | Milliseconds | Seconds |
| Boundary | Internal | System boundary |
| Purpose | Design feedback | Feature verification |

## The Conversation

Acceptance tests are born from conversations:
1. **Stakeholder** describes the desired behavior
2. **Developer** asks clarifying questions
3. **Together** they write Given-When-Then scenarios
4. **Developer** automates the scenarios
5. **Scenarios** become the executable specification

## Anti-Patterns
- Writing acceptance tests in code language (defeats the purpose)
- Testing implementation details in acceptance tests
- Manual-only acceptance testing (does not scale)
- Writing acceptance tests after the feature is built (spec-after, not spec-first)
- Brittle acceptance tests that break with UI changes (test behavior, not layout)

## Training Sources
- "Clean Craftsmanship" by Robert C. Martin (Chapter on Acceptance Testing)
- "Specification by Example" by Gojko Adzic
- Uncle Bob's blog posts on acceptance testing discipline
- Conflicting view: "Acceptance tests are too slow/expensive" -- understand the counter and the cost of NOT having them
