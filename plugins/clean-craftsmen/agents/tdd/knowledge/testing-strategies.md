# Testing Strategies

## The Testing Pyramid

```
         /  E2E  \          Few, slow, expensive
        /  Integ  \         Some, medium speed
       / Unit Tests \       Many, fast, cheap
      ________________
```

### Unit Tests (base)
- Test a single unit (function, method, class) in isolation
- Fast: milliseconds per test, full suite in seconds
- No I/O, no database, no network, no file system
- Use test doubles for dependencies
- Thousands of these

### Integration Tests (middle)
- Test how units work together
- May hit databases, file systems, external services
- Slower: seconds per test
- Verify wiring and configuration
- Hundreds of these

### End-to-End Tests (top)
- Test the full system from user perspective
- Slowest, most brittle, most expensive
- Cover critical user journeys only
- Tens of these

## Test Naming

Tests are specifications. Their names should read like documentation.

### Good patterns:
- `should_return_empty_list_when_no_items_exist`
- `rejects_negative_quantities`
- `calculates_tax_for_multi_state_orders`

### Bad patterns:
- `test1`, `testCalculate`, `testUserService` -- meaningless
- `testGetUser_returns_user` -- just restates the code

## Arrange-Act-Assert (AAA)

Every test has exactly three sections:

```python
def test_applies_discount_to_order():
    # Arrange - set up the preconditions
    order = Order(items=[Item("Widget", 100)])
    discount = PercentageDiscount(10)

    # Act - perform the action under test
    discounted = discount.apply(order)

    # Assert - verify the expected outcome
    assert discounted.total == 90
```

Rules:
- ONE act per test (multiple asserts are fine if they verify the same action)
- If Arrange is getting long, consider a test fixture or builder
- Keep Assert focused -- don't assert irrelevant side effects

## Given-When-Then (BDD style)

Same structure, more natural language emphasis:

```python
def test_given_premium_user_when_ordering_then_free_shipping():
    # Given
    user = User(tier="premium")
    order = Order(user=user, items=[Item("Widget", 50)])

    # When
    shipping = ShippingCalculator().calculate(order)

    # Then
    assert shipping.cost == 0
```

## Test Design Principles

### F.I.R.S.T.
- **Fast**: Run in milliseconds. Slow tests don't get run.
- **Independent**: No test depends on another. Run in any order.
- **Repeatable**: Same result every time, in any environment.
- **Self-validating**: Pass or fail -- no manual inspection.
- **Timely**: Written before (or with) production code, not after.

### One Concept Per Test
Each test verifies one behavioral concept. Multiple asserts are fine if they all verify the same concept.

### Test Behavior, Not Implementation
- Bad: "assert internal_list.length == 3" (tests data structure choice)
- Good: "assert cart.item_count() == 3" (tests observable behavior)

### Descriptive Over DRY in Tests
Test clarity > test brevity. Some duplication in tests is acceptable if it makes each test independently readable.

## Testing Legacy Code

When you can't do TDD because the code already exists:

### The Legacy Code Dilemma
"To change code safely, we need tests. To write tests, we need to change code." -- Michael Feathers

### Strategies:
1. **Characterization tests**: Write tests that document current behavior (not desired behavior)
2. **Sprout method**: Write new behavior as a new, tested method; call it from the old code
3. **Wrap method**: Wrap existing method with a new tested one
4. **Seam finding**: Identify points where behavior can be changed without modifying the code (dependency injection, polymorphism, preprocessing)

## Test Smells

- **Fragile tests**: Break with unrelated changes. Fix: test behavior, not implementation.
- **Slow tests**: Full suite takes minutes. Fix: mock external dependencies, test pyramid balance.
- **Obscure tests**: Can't understand what they test. Fix: better names, clear AAA structure, no magic numbers.
- **Coupled tests**: Tests depend on shared state or execution order. Fix: proper setup/teardown, independent data.
- **Redundant tests**: Multiple tests verify the same thing. Fix: keep the most expressive one.
