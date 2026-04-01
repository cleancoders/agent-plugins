# Open-Closed Principle (OCP)

> "Software entities (classes, modules, functions) should be open for extension, but closed for modification."
> -- Bertrand Meyer (1988), refined by Robert C. Martin

## The Principle

You should be able to add new behavior to a system without changing existing code. When a single change ripples through dozens of files, OCP is violated.

## The Goal

A well-designed system can accommodate new features by adding new code, not modifying old code. This is the holy grail of software architecture.

## Achieving OCP: Strategy Pattern

### Violation
```python
class AreaCalculator:
    def calculate(self, shape):
        if shape.type == "circle":
            return 3.14 * shape.radius ** 2
        elif shape.type == "rectangle":
            return shape.width * shape.height
        elif shape.type == "triangle":
            return 0.5 * shape.base * shape.height
        # Every new shape requires modifying this class
```

### Fix
```python
class Shape(ABC):
    @abstractmethod
    def area(self) -> float:
        pass

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius
    def area(self):
        return 3.14 * self.radius ** 2

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height
    def area(self):
        return self.width * self.height

# Adding Triangle requires NO changes to existing code
class Triangle(Shape):
    def __init__(self, base, height):
        self.base = base
        self.height = height
    def area(self):
        return 0.5 * self.base * self.height

class AreaCalculator:
    def calculate(self, shape: Shape):
        return shape.area()  # closed for modification
```

## Techniques for OCP

### Polymorphism
Replace conditionals with polymorphic dispatch (as above).

### Plugin Architecture
Define extension points where new behavior can be plugged in without changing the core.

### Decorator Pattern
Wrap existing behavior with new behavior without modifying the original.

```python
class LoggingRepository:
    def __init__(self, inner: Repository):
        self.inner = inner
        self.logger = Logger()

    def save(self, entity):
        self.logger.log(f"Saving {entity}")
        self.inner.save(entity)
```

### Configuration / Data-Driven
Move decision-making to configuration rather than code.

## When NOT to Apply OCP

- Don't create abstractions preemptively for changes that may never come
- Wait until you have two concrete cases before abstracting (Rule of Three)
- Simple scripts and one-off tools don't need OCP
- Over-application creates unnecessary complexity (too many interfaces, too many indirections)

## Connection to Other Principles

- **SRP**: A class with one responsibility is easier to close for modification
- **DIP**: Depending on abstractions (DIP) is the mechanism that makes OCP work
- **LSP**: Subtypes must be truly substitutable for OCP extensions to work correctly
