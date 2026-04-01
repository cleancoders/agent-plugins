# TDD Anti-Patterns

## Process Anti-Patterns

### Test After Development (TAD)
Writing all code first, then adding tests. What you lose:
- Design feedback: tests can't influence a design that's already written
- Edge case discovery: you only test what you thought of during coding
- Confidence: how do you know the test would have caught a bug?
- Motivation: writing tests for existing code feels like chores

### Big Bang TDD
Writing a huge test that requires implementing a large feature. The cycle becomes Red...long pause...Green. You lose the incremental design benefit.

### Skipping Refactor
Going Red-Green-Red-Green-Red-Green without ever refactoring. The code works but accumulates design debt. The refactor step IS the design step.

### Analysis Paralysis
Spending 30 minutes deciding what to test first. Pick the simplest case and start. The tests will guide you.

## Test Design Anti-Patterns

### The Giant
A test method with dozens of assertions, testing multiple behaviors. Split into focused tests.

### The Mockery
Mocking so many things that the test is really just testing the mock framework. If you're arranging 15 mocks, the class under test has too many dependencies.

### The Inspector
A test that digs into private state to verify internal implementation. Test through the public API only.

### The Flickering Test
Sometimes passes, sometimes fails. Causes: time-dependent logic, shared mutable state, race conditions, network calls.

### The Secret Catcher
A test with no assertions. It "passes" just because no exception was thrown. This tests nothing meaningful.

### The Loudmouth
A test that prints to console or writes files as its primary verification. Use programmatic assertions.

### The Free Rider
A test that piggybacks assertions onto another test's setup. Write focused tests.

### The Dead Tree
Commented-out tests. Either fix them or delete them. Commented code is dead code.

### The Environmental Spy
Tests that depend on specific environment (OS, timezone, locale, file paths). Use abstractions.

## Structural Anti-Patterns

### God Test Class
One massive test file for the entire module. Each class should have its own test file.

### Test-Per-Method
One test per method (test_get, test_set, test_calculate). Test behaviors, not methods. A behavior may span methods; a method may have multiple behaviors.

### Copy-Paste Tests
Duplicating test code instead of extracting test helpers or parameterized tests. Test code deserves the same care as production code.

### Test Data Explosion
Huge inline data structures in tests. Extract to builders, factories, or fixtures.

## Cultural Anti-Patterns

### TDD Theater
"We do TDD" but tests are written after code, or only for easy cases, or only during code review. Real TDD means every feature starts with a failing test.

### Coverage Worship
Chasing 100% coverage metrics. Coverage measures lines executed, not behaviors verified. A test that touches every line but asserts nothing has 100% coverage and 0% value.

### Testing Nihilism
"Tests slow us down" or "Our code is too complex to test." Code that's hard to test is poorly designed. TDD makes it testable by construction.
