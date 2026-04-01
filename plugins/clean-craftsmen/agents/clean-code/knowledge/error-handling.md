# Error Handling

> "Error handling is important, but if it obscures logic, it's wrong."
> -- Robert C. Martin, Clean Code Chapter 7

## Principles

### Use Exceptions Rather Than Return Codes

Return codes force callers into immediate error handling, cluttering the logic:
```python
# Bad - error codes
status = device.open()
if status == OK:
    status = device.configure()
    if status == OK:
        device.start()

# Good - exceptions
try:
    device.open()
    device.configure()
    device.start()
except DeviceError as e:
    logger.log(e)
```

### Write Try-Catch-Finally First

When writing code that could throw, start with the try-catch-finally. This defines the scope and contract: "no matter what happens in the try, the caller can count on the catch/finally behavior."

### Use Unchecked Exceptions

Checked exceptions (Java-specific, but the principle applies) violate OCP. Adding a new exception to a low-level function forces changes in every function in the call chain.

### Provide Context with Exceptions

Include enough information to determine the source and location of the error:
```python
# Bad
raise ValueError("Invalid input")

# Good
raise ValueError(
    f"Cannot process order {order_id}: quantity {qty} exceeds "
    f"available stock of {available} for product {product_id}"
)
```

### Define Exceptions by the Caller's Needs

Classify exceptions by how the caller handles them, not by where they come from:

```python
# Bad - caller must handle many exception types
try:
    port.open()
except DeviceResponseException:
    report_port_error()
except ATM1212UnlockedException:
    report_port_error()
except GMXError:
    report_port_error()

# Good - wrap the external API
class LocalPort:
    def open(self):
        try:
            self.inner.open()
        except (DeviceResponseException, ATM1212UnlockedException, GMXError):
            raise PortDeviceFailure()

try:
    port.open()
except PortDeviceFailure:
    report_port_error()
```

### Don't Return Null

Returning null forces callers to check for null everywhere. One missing check = NullPointerException.

```python
# Bad
def get_employees():
    if no_employees:
        return None

employees = get_employees()
if employees is not None:  # every caller must remember this
    for e in employees:
        ...

# Good - return empty collection
def get_employees():
    if no_employees:
        return []

for e in get_employees():  # just works, no null check
    ...
```

### Don't Pass Null

Passing null as an argument is even worse than returning it. Most functions don't gracefully handle null arguments.

```python
# Bad
calculator.calculate(None, Point(1, 2))

# If you must handle nullable arguments, use:
# 1. Default values
# 2. Assertions
# 3. Null Object pattern
```

### The Special Case Pattern

Instead of handling special cases with null checks or error codes, create a special case object:

```python
# Bad
employee = db.find_employee(id)
if employee is None:
    pay = 0
else:
    pay = employee.calculate_pay()

# Good - Null Object / Special Case
class NullEmployee:
    def calculate_pay(self):
        return 0

def find_employee(id):
    result = db.query(id)
    return result if result else NullEmployee()

pay = find_employee(id).calculate_pay()  # always works
```

## Summary

- Error handling is a separate concern from the main logic
- Use exceptions for exceptional conditions
- Wrap third-party APIs to consolidate error handling
- Never return or pass null
- Use the Special Case pattern to eliminate null checks
