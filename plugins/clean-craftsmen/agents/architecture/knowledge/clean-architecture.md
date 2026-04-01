# Clean Architecture

> "The center of your application is not the database. It is not one or more of the frameworks you may be using. The center of your application is the use cases of your application."
> -- Robert C. Martin

## The Dependency Rule

Dependencies must point inward. Inner circles know nothing about outer circles.

```
  +-----------------------------------------+
  |  Frameworks & Drivers (outermost)       |
  |  +-----------------------------------+  |
  |  |  Interface Adapters               |  |
  |  |  +-----------------------------+  |  |
  |  |  |  Application Business Rules |  |  |
  |  |  |  +----------------------+   |  |  |
  |  |  |  |  Enterprise Business |   |  |  |
  |  |  |  |  Rules (innermost)   |   |  |  |
  |  |  |  +----------------------+   |  |  |
  |  |  +-----------------------------+  |  |
  |  +-----------------------------------+  |
  +-----------------------------------------+
```

### Entities (innermost)
Enterprise-wide business rules. Pure domain objects. No framework dependencies.
```python
class Order:
    def __init__(self, items, customer):
        self.items = items
        self.customer = customer

    def total(self):
        return sum(item.price * item.quantity for item in self.items)

    def is_eligible_for_discount(self):
        return self.total() > 100
```

### Use Cases (application layer)
Application-specific business rules. Orchestrate entities to fulfill a use case.
```python
class PlaceOrderUseCase:
    def __init__(self, order_repo, notification_service):
        self.order_repo = order_repo        # interface, not implementation
        self.notifications = notification_service  # interface

    def execute(self, order_request):
        order = Order(order_request.items, order_request.customer)
        if order.is_eligible_for_discount():
            order.apply_discount(Decimal("0.10"))
        self.order_repo.save(order)
        self.notifications.notify_order_placed(order)
        return order
```

### Interface Adapters
Convert data between use cases and external agencies. Controllers, presenters, gateways.
```python
class OrderController:
    def __init__(self, place_order: PlaceOrderUseCase):
        self.place_order = place_order

    def handle_post(self, request):
        order_request = OrderRequest.from_http(request)  # adapter
        order = self.place_order.execute(order_request)
        return OrderResponse.from_order(order)  # adapter
```

### Frameworks & Drivers (outermost)
Database, web framework, UI. Details. Pluggable.
```python
class PostgresOrderRepository(OrderRepository):
    def save(self, order):
        # SQL-specific implementation
        ...
```

## Key Insight: The Plugin Architecture

The database is a plugin to the use cases, not the other way around. The web framework is a plugin. The UI is a plugin. Your business logic should work identically regardless of which plugins are attached.

## Ports and Adapters (Hexagonal Architecture)

Same concept, different metaphor. The application has "ports" (interfaces) and "adapters" (implementations).

```
                  [Web Adapter]
                       |
                       v
[CLI Adapter] --> [APPLICATION] <-- [DB Adapter]
                       ^
                       |
                  [Test Adapter]
```

The application defines what it needs (ports). Adapters implement those needs for specific technologies.

## When This Matters

- Systems that need to last years
- Teams that need to work independently on different layers
- Systems where infrastructure may change (database migration, framework upgrade)
- Systems that need thorough testing without infrastructure

## When This is Overkill

- Small scripts or prototypes
- CRUD applications with no business logic
- Throwaway code
- When the team is small and the codebase is simple
