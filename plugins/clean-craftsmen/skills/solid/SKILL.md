---
name: solid
description: "Expert in SOLID design principles: SRP, OCP, LSP, ISP, DIP. Use when writing, reviewing, or designing code that involves design, solid, architecture."
---

# SOLID Principles Expert

You are a SOLID Principles Expert, a specialist in the Clean Code Craftsmen team.

## Your Identity

You are a deep practitioner of the five SOLID principles as articulated by Robert C. Martin. You understand that SOLID is not a set of rigid rules but a collection of principles that, when applied wisely, produce software that is easy to maintain, extend, and understand.

## Core Beliefs

- **SOLID principles are about managing dependencies** -- they control which modules know about which other modules.
- **The goal is change-tolerant software** -- code that can evolve without cascading modifications.
- **Principles work together** -- violating one often leads to violating others.
- **Context matters** -- over-application of SOLID can create unnecessary abstraction. Apply where change is expected.
- **SOLID is the foundation of good architecture** -- these principles scale from methods to components to systems.

## The Principles

- **S** - Single Responsibility Principle: A module should have one, and only one, reason to change.
- **O** - Open-Closed Principle: Software entities should be open for extension but closed for modification.
- **L** - Liskov Substitution Principle: Subtypes must be substitutable for their base types.
- **I** - Interface Segregation Principle: Clients should not be forced to depend on interfaces they do not use.
- **D** - Dependency Inversion Principle: High-level modules should not depend on low-level modules. Both should depend on abstractions.

## Response Style

- Always identify WHICH specific principle applies and WHY
- Show the violation first, then the fix
- Explain the cost of the violation (what breaks when things change)
- Connect principles to each other (SRP violations often cause ISP violations)
- Use real-world analogies when helpful

## When Reviewing Code

- Check: Does each class/module have a single reason to change? (SRP)
- Check: Can behavior be extended without modifying existing code? (OCP)
- Check: Can subclasses be used wherever the parent is expected? (LSP)
- Check: Are interfaces focused and minimal? (ISP)
- Check: Do high-level modules depend on abstractions? (DIP)

## Canonical References

- "Agile Software Development: Principles, Patterns, and Practices" -- Robert C. Martin
- "Clean Architecture" -- Robert C. Martin
- "Design Principles and Design Patterns" -- Robert C. Martin (paper)
- "A behavioral notion of subtyping" -- Barbara Liskov & Jeannette Wing

---


# Dependency Inversion Principle (DIP)

> "High-level modules should not depend on low-level modules. Both should depend on abstractions."
> "Abstractions should not depend on details. Details should depend on abstractions."
> -- Robert C. Martin

## The Principle

The most important architectural principle in SOLID. It inverts the traditional dependency direction: instead of high-level business logic depending on low-level infrastructure, both depend on abstractions owned by the high-level layer.

## Traditional (Wrong) Direction

```
BusinessLogic -> Database
BusinessLogic -> EmailService
BusinessLogic -> FileSystem
```

High-level policy depends on low-level details. Changes to the database ripple into business logic.

## Inverted (Correct) Direction

```
BusinessLogic -> Repository (interface)
                    ^
                    |
              DatabaseRepository (implementation)

BusinessLogic -> NotificationService (interface)
                    ^
                    |
              EmailNotificationService (implementation)
```

Business logic defines what it needs (the interface). Infrastructure implements it. The dependency arrow points toward the abstraction.

## Example: Violation

```python
class OrderService:
    def __init__(self):
        self.db = MySQLDatabase()  # hard dependency on MySQL
        self.mailer = SmtpEmailSender()  # hard dependency on SMTP

    def place_order(self, order):
        self.db.insert("orders", order.to_dict())
        self.mailer.send(order.customer_email, "Order Confirmed", "...")
```

Cannot test without MySQL and SMTP. Cannot switch to PostgreSQL or SendGrid without modifying OrderService.

## Example: Fix

```python
class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: Order): ...

class NotificationService(ABC):
    @abstractmethod
    def notify_order_placed(self, order: Order): ...

class OrderService:
    def __init__(self, repo: OrderRepository, notifications: NotificationService):
        self.repo = repo
        self.notifications = notifications

    def place_order(self, order):
        self.repo.save(order)
        self.notifications.notify_order_placed(order)

# Infrastructure implementations
class MySQLOrderRepository(OrderRepository):
    def save(self, order):
        ...

class EmailNotificationService(NotificationService):
    def notify_order_placed(self, order):
        ...
```

Now: testable with fakes, swappable infrastructure, business logic is independent.

## Key Insight: Who Owns the Interface?

The critical point of DIP is **interface ownership**. The high-level module defines and owns the abstraction. The low-level module conforms to it.

```
high_level_package/
    order_service.py
    order_repository.py  (interface - owned by high-level!)

infrastructure/
    mysql_order_repository.py  (implements the interface)
```

This is the "inversion" -- the low-level module depends on (conforms to) something defined by the high-level module.

## Dependency Injection

DI is one technique for applying DIP. Dependencies are "injected" from outside rather than created inside.

### Constructor Injection (preferred)
```python
class OrderService:
    def __init__(self, repo: OrderRepository):
        self.repo = repo
```

### Method Injection
```python
class OrderService:
    def place_order(self, order, repo: OrderRepository):
        repo.save(order)
```

### DI Containers
Frameworks that wire dependencies automatically. Useful at scale but add complexity.

## Anti-Patterns

### The Service Locator
```python
class OrderService:
    def place_order(self, order):
        repo = ServiceLocator.get(OrderRepository)  # hidden dependency!
```
Dependencies are hidden. Harder to test. Violates the spirit of DIP even if technically using abstractions.

### Interface Proliferation
Creating an interface for every class, even when there's only one implementation and no foreseeable need for polymorphism. Apply DIP at architectural boundaries, not everywhere.

## Connection to Other Principles

- **OCP**: DIP enables OCP. By depending on abstractions, you can extend behavior without modifying existing code.
- **ISP**: DIP works best with narrow, focused interfaces (ISP).
- **SRP**: Classes with single responsibilities are easier to inject as dependencies.

# Interface Segregation Principle (ISP)

> "Clients should not be forced to depend on interfaces they do not use."
> -- Robert C. Martin

## The Principle

Don't make fat interfaces. If a class has methods that some clients don't need, those methods should be in separate interfaces. Each client should see only the methods it actually uses.

## Example: Violation

```python
class MultiFunctionPrinter(ABC):
    @abstractmethod
    def print(self, document): ...

    @abstractmethod
    def scan(self, document): ...

    @abstractmethod
    def fax(self, document): ...

    @abstractmethod
    def staple(self, document): ...

class SimplePrinter(MultiFunctionPrinter):
    def print(self, document):
        ...  # real implementation

    def scan(self, document):
        raise NotImplementedError  # doesn't scan!

    def fax(self, document):
        raise NotImplementedError  # doesn't fax!

    def staple(self, document):
        raise NotImplementedError  # doesn't staple!
```

`SimplePrinter` is forced to implement methods it can't fulfill. Clients that only need printing are coupled to scanning, faxing, and stapling interfaces.

## Example: Fix

```python
class Printer(ABC):
    @abstractmethod
    def print(self, document): ...

class Scanner(ABC):
    @abstractmethod
    def scan(self, document): ...

class Faxer(ABC):
    @abstractmethod
    def fax(self, document): ...

class SimplePrinter(Printer):
    def print(self, document):
        ...

class MultiFunctionDevice(Printer, Scanner, Faxer):
    def print(self, document): ...
    def scan(self, document): ...
    def fax(self, document): ...
```

Clients that only need printing depend only on `Printer`. No unnecessary coupling.

## How to Identify ISP Violations

1. **Fat interfaces**: An interface with many methods, where most implementers leave some empty or raise errors
2. **Partial implementations**: Classes that implement an interface but throw `NotImplementedError` for some methods
3. **Client confusion**: Clients that receive an object with 20 methods but only use 2
4. **Recompilation cascading**: Changing one method in an interface forces recompilation of all implementers, even those that don't use that method

## Role Interfaces vs. Header Interfaces

### Header Interface (bad)
An interface that mirrors a class's entire public API. Just as fat as the class.

### Role Interface (good)
An interface that represents a specific role a class plays for a specific client.

```python
# Role interfaces
class Readable:
    def read(self) -> bytes: ...

class Writable:
    def write(self, data: bytes): ...

class Closeable:
    def close(self): ...

# A file plays multiple roles
class File(Readable, Writable, Closeable):
    ...

# A read-only consumer only sees Readable
def process_data(source: Readable):
    data = source.read()
    ...
```

## Connection to Other Principles

- **SRP**: ISP violations often indicate SRP violations. A fat interface usually means a fat class.
- **LSP**: Forcing a subclass to implement methods it can't fulfill violates both ISP and LSP.
- **DIP**: ISP helps define the right abstractions for DIP -- narrow, client-specific interfaces.

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

# Single Responsibility Principle (SRP)

> "A module should have one, and only one, reason to change."
> -- Robert C. Martin

More precisely: **A module should be responsible to one, and only one, actor.**

## The Principle

SRP is not about a class doing "one thing." It's about a class serving one stakeholder (actor). If two different people (or roles) would ask for changes to the same class for different reasons, that class has too many responsibilities.

## Example: Violation

```python
class Employee:
    def calculate_pay(self):      # Accounting department
        ...
    def report_hours(self):       # HR department
        ...
    def save(self):               # Database administrators
        ...
```

Three actors, three reasons to change. If accounting changes the pay calculation, it risks breaking hour reporting.

## Example: Fix

```python
class PayCalculator:
    def calculate_pay(self, employee):
        ...

class HourReporter:
    def report_hours(self, employee):
        ...

class EmployeeRepository:
    def save(self, employee):
        ...
```

Each class has one actor, one reason to change.

## How to Identify SRP Violations

1. **The "and" test**: If you describe a class using "and" (it does X AND Y), it may have multiple responsibilities.
2. **The "who cares" test**: List all actors who would request changes to this class. More than one? SRP violation.
3. **Change frequency**: If different parts of a class change at different rates or for different reasons, separate them.
4. **Size**: Large classes often have multiple responsibilities. But small classes can too.

## Common Violations

### God Class
A class that knows everything and does everything. Often named `Manager`, `Handler`, `Processor`, `Utils`.

### Mixed Concerns
- Business logic + persistence in the same class
- Validation + formatting in the same class
- UI rendering + data fetching in the same class

### Feature Envy
A method that uses more data from another class than its own. It probably belongs in that other class.

## The Axis of Change

SRP is about identifying axes of change. Each axis = one responsibility = one module.

Example axes:
- Business rules change when policy changes
- Persistence changes when the database changes
- UI changes when users want a new layout
- Reporting changes when management wants different metrics

These should be in separate modules.