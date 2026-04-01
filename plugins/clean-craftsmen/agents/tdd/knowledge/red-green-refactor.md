# Red-Green-Refactor

The fundamental cycle of TDD. Every piece of production code is born from this cycle.

## The Cycle

### Red: Write a Failing Test
- Write a test that expresses the next increment of desired behavior
- Run it. Watch it fail. The failure message should be clear and meaningful.
- If the test passes without writing new code, either the behavior already exists (remove the test) or the test is wrong (fix it)
- The test should be the simplest possible expression of the next requirement

### Green: Make It Pass
- Write the minimum production code to make the failing test pass
- "Minimum" means it: take shortcuts, hardcode values, use the simplest possible implementation
- Do NOT write "the right" solution yet -- just make the test green
- This constraint forces small steps and prevents over-engineering
- Kent Beck: "Make it work, make it right, make it fast" -- this is the "make it work" step

### Refactor: Clean Up
- Now that you have green tests, improve the code's design
- Remove duplication (in production code AND test code)
- Improve names, extract methods, simplify logic
- The tests protect you -- refactor boldly
- Run tests after each refactoring step -- stay green
- This is where the design emerges

## Cycle Duration

A complete Red-Green-Refactor cycle should take **1-10 minutes**. If it takes longer:
- Your step is too big. Break it into smaller increments.
- You may be trying to implement too much behavior at once.

## The Transformation Priority Premise (Robert C. Martin)

When making a test pass, prefer simpler transformations over complex ones:

1. ({} -> nil) -- no code to code returning nil/null
2. (nil -> constant) -- nil to a constant value
3. (constant -> constant+) -- a simple constant to a more complex constant
4. (constant -> scalar) -- constant to a variable
5. (statement -> statements) -- add unconditional statements
6. (unconditional -> if) -- split execution path
7. (scalar -> collection) -- scalar to collection
8. (collection -> collection+) -- add to collection
9. (statement -> tail-recursion) -- add recursion
10. (if -> while/loop) -- replace conditional with loop
11. (statement -> recursion) -- general recursion
12. (expression -> function) -- replace expression with function call
13. (variable -> assignment) -- replace value with mutated value

Choose the transformation closest to the top of the list. This produces simpler, more correct algorithms.

## Example: FizzBuzz via TDD

### Cycle 1 (Red)
```python
def test_returns_1_for_1():
    assert fizzbuzz(1) == "1"
```

### Cycle 1 (Green)
```python
def fizzbuzz(n):
    return "1"  # constant -- simplest thing
```

### Cycle 2 (Red)
```python
def test_returns_2_for_2():
    assert fizzbuzz(2) == "2"
```

### Cycle 2 (Green)
```python
def fizzbuzz(n):
    return str(n)  # constant -> scalar transformation
```

### Cycle 3 (Red)
```python
def test_returns_fizz_for_3():
    assert fizzbuzz(3) == "Fizz"
```

### Cycle 3 (Green)
```python
def fizzbuzz(n):
    if n % 3 == 0:
        return "Fizz"
    return str(n)  # unconditional -> if
```

Each cycle is tiny, deliberate, and builds on the previous.

## Anti-Patterns

### Big Step TDD
Writing a test that requires implementing half the system to pass. This defeats the purpose -- you lose the design feedback loop.

### Test After Development
Writing code first, then tests. You lose:
- Design pressure (tests don't influence the design)
- Confidence (are you testing what you think?)
- Coverage (you'll miss edge cases you didn't think of during coding)

### The Guru Test
A test so complex it needs its own tests. Tests should be obvious.

### The Liar
A test that passes but doesn't actually test what it claims. Often caused by testing implementation rather than behavior.
