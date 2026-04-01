# E2E Testing Knowledge Overview

## The Test Pyramid

```
      /  E2E  \        Few, slow, expensive
     /Integration\     Some, moderate speed
    /   Unit Tests  \   Many, fast, cheap
```

E2E tests sit at the top: fewest in number, most expensive to run, but verify the whole system works together.

## When to Write E2E Tests

### Good Candidates
- Critical user journeys (login, checkout, signup)
- Integration points between systems
- Smoke tests for deployments
- Regression tests for bugs that slipped through lower layers

### Bad Candidates
- Business logic (use unit tests)
- Feature verification (use acceptance tests)
- Edge cases (use unit/integration tests)
- UI styling (use visual regression tools)

## Maintainable E2E Patterns

### Page Objects
Abstract UI interactions into objects. Tests call methods like `loginPage.login(user, password)` instead of finding selectors directly. This creates one place to update when the UI changes.

### Test Data Management
- Each test sets up its own data
- Tests do not depend on shared state
- Teardown is reliable (or tests are idempotent)
- Use factories/builders for test data

### Determinism
- No `sleep()` calls -- use explicit waits for conditions
- No shared mutable state between tests
- Tests can run in any order
- Tests can run in parallel

## Flakiness

### Common Causes
- Race conditions (UI updates not waited for)
- Shared test state
- External service dependencies
- Time-dependent logic
- Network latency variations

### Prevention
- Explicit waits over sleeps
- Isolated test data
- Mock external services in E2E when possible
- Retry flaky tests exactly once -- if they need more, fix the root cause
- Track flakiness metrics and fix aggressively

## Training Sources
- "Growing Object-Oriented Software, Guided by Tests" by Freeman & Pryce
- Google's testing philosophy (small/medium/large tests)
- Uncle Bob on test discipline and the testing pyramid
- Conflicting view: "Just test manually" vs. automation ROI -- understand both
