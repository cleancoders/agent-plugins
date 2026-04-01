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
