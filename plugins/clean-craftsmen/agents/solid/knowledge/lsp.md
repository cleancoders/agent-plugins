# Liskov Substitution Principle (LSP)

> "If for each object o1 of type S there is an object o2 of type T such that for all programs P defined in terms of T, the behavior of P is unchanged when o1 is substituted for o2, then S is a subtype of T."
> -- Barbara Liskov (1987)

Simplified: **Subtypes must be substitutable for their base types without altering the correctness of the program.**

## The Principle

If your code uses a base class/interface reference, swapping in any derived class must work without surprises. The derived class must honor the contract of the base class.

## Classic Violation: Rectangle-Square

```python
class Rectangle:
    def __init__(self, width, height):
        self._width = width
        self._height = height

    def set_width(self, w):
        self._width = w

    def set_height(self, h):
        self._height = h

    def area(self):
        return self._width * self._height

class Square(Rectangle):
    def set_width(self, w):
        self._width = w
        self._height = w  # surprise! setting width also changes height

    def set_height(self, h):
        self._width = h
        self._height = h
```

```python
def test_area(rect: Rectangle):
    rect.set_width(5)
    rect.set_height(4)
    assert rect.area() == 20  # fails for Square! (returns 16)
```

Square violates the contract of Rectangle. A square IS-A rectangle mathematically, but not behaviorally in this design.

## LSP Contract Rules

### Preconditions cannot be strengthened
A subtype cannot require MORE from callers than the base type.

### Postconditions cannot be weakened
A subtype cannot promise LESS than the base type.

### Invariants must be preserved
A subtype must maintain all invariants of the base type.

### History constraint
A subtype cannot introduce methods that mutate state in ways the base type wouldn't allow.

## Signs of LSP Violation

1. **Type-checking in client code**: `if isinstance(x, SpecificType)` -- the client shouldn't need to know the concrete type
2. **Empty method overrides**: Subclass overrides a method with a no-op or throws `NotImplementedError`
3. **Surprising behavior**: Calling a method on a subtype produces unexpected results
4. **Conditional logic based on type**: Switch/if-else chains checking the type of an object

## Example: NotImplementedError = LSP Violation

```python
class Bird:
    def fly(self):
        ...

class Penguin(Bird):
    def fly(self):
        raise NotImplementedError("Penguins can't fly")
```

Any code expecting a `Bird` that calls `fly()` will break with a `Penguin`. The fix: restructure the hierarchy.

```python
class Bird:
    def move(self):
        ...

class FlyingBird(Bird):
    def fly(self):
        ...

class Penguin(Bird):
    def swim(self):
        ...
```

## Design by Contract

LSP is closely related to Bertrand Meyer's Design by Contract:
- Every method has preconditions (what it requires) and postconditions (what it guarantees)
- Subclasses can loosen preconditions and tighten postconditions
- They cannot tighten preconditions or loosen postconditions

## Practical Advice

- Favor composition over inheritance -- it sidesteps most LSP issues
- Use interfaces to define contracts rather than concrete inheritance
- "IS-A" in the real world doesn't always mean "IS-A" in code
- If you find yourself needing type checks, your hierarchy is wrong
