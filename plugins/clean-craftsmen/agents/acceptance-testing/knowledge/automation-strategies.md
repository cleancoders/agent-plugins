# Acceptance Test Automation Strategies

## The Separation of Concerns

An acceptance test has two layers:

1. **Specification layer**: What the test checks (business language, Given-When-Then)
2. **Automation layer**: How the test interacts with the system (code, drivers, fixtures)

These MUST be separate. The specification should be readable by non-programmers. The automation handles the mechanical work.

## Testing Through Different Boundaries

### Through the UI (System Tests)
- Test the entire stack from UI to database.
- Slowest but most realistic.
- Use page objects or screen objects to abstract UI details.
- Reserve for critical user journeys. Do not test every edge case through the UI.

### Through the API (Service Tests)
- Skip the UI, test through HTTP/API/service endpoints.
- Faster and more stable than UI tests.
- Good for testing business logic and workflows.
- Still exercises real infrastructure (database, caches, queues).

### Through the Domain (Subcutaneous Tests)
- Skip UI and API layers. Test the use case / application service layer directly.
- Fast. No HTTP overhead. No UI rendering.
- Tests the business rules without infrastructure coupling.
- Uncle Bob's preferred level for most acceptance tests ("Clean Architecture" principles applied to testing).

### Deciding Which Level
- **UI tests**: "Does the system work end-to-end as the user sees it?" (few)
- **API tests**: "Does the service contract work correctly?" (some)
- **Domain tests**: "Does the business rule work correctly?" (many)

This mirrors the test pyramid but at the acceptance test level.

## Fixture Design

Fixtures bridge specifications to code:

### Thin Fixtures
- Fixtures do as little as possible. They translate business language to method calls.
- `Given a registered user "Alice"` -> `createUser("Alice")`
- The fixture does NOT contain business logic. It calls the system.

### Setup Helpers
- Common preconditions belong in shared setup helpers, not duplicated across fixtures.
- `Given a standard e-commerce setup` -> calls a helper that creates users, products, and categories.
- But beware: overly complex setup helpers become fragile. Prefer explicit state.

### Teardown and Isolation
- Each test must be independent. Run in any order.
- Database: use transactions that roll back, or reset the database between tests.
- External services: use test doubles/stubs for third-party integrations.

## Data Management

### Test Data Builders
- Use the builder pattern for creating test data.
- `UserBuilder().withName("Alice").withSubscription("premium").build()`
- Builders express INTENT: only specify what matters for this test.
- Default values for everything else.

### Object Mother
- A factory that creates common test objects.
- Less flexible than builders but simpler for common cases.
- `TestUsers.premiumUser()`, `TestUsers.expiredUser()`

### Database State
- NEVER depend on pre-existing data in the database.
- Each test creates what it needs and cleans up after.
- Shared test data across tests is a coupling trap.

## Dealing with Slow Tests

### Parallelization
- Run acceptance tests in parallel across multiple processes/machines.
- Requires test isolation (no shared mutable state).

### Selective Execution
- Tag tests by feature, risk, or speed.
- CI runs fast tests on every commit; slow tests on merge to main.

### Test Doubles for External Systems
- Replace slow external services (email, payment, third-party APIs) with in-memory doubles.
- The acceptance test verifies YOUR system's behavior, not the external system's.

## Continuous Integration Pipeline Position

```
Commit -> Unit Tests (seconds) -> Acceptance Tests (minutes) -> Deploy to Staging -> Manual/Exploratory
```

- Unit tests gate every commit. Fast, frequent.
- Acceptance tests gate deployment. Thorough, slower.
- If acceptance tests are too slow (>10 minutes), investigate: usually a test isolation or fixture problem.

## Training Sources
- "Clean Craftsmanship" by Robert C. Martin (acceptance testing as discipline)
- "Growing Object-Oriented Software, Guided by Tests" -- Freeman & Pryce (acceptance-test-driven development)
- "Specification by Example" -- Gojko Adzic (patterns for living documentation)
- FitNesse documentation (fitnesse.org)
- Micah Martin on practical acceptance testing at 8th Light
- Conflicting: "You don't need acceptance tests if you have good unit tests" -- Uncle Bob disagrees: unit tests verify units, acceptance tests verify features. Both are necessary.
