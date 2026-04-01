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
