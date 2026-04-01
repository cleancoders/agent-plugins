# Test Doubles

Test doubles replace real dependencies in tests. The term comes from Gerard Meszaros ("xUnit Test Patterns"). Understanding the differences is critical for writing good tests.

## Types of Test Doubles

### Dummy
Objects passed around but never used. Fill parameter lists.
```python
def test_format_report():
    dummy_logger = None  # never called
    formatter = ReportFormatter(dummy_logger)
    assert formatter.format(data) == expected
```

### Stub
Provides canned answers to calls made during the test. Does not respond to anything outside what's programmed.
```python
class StubUserRepository:
    def find_by_id(self, id):
        return User(id=1, name="Alice")  # always returns this

def test_greets_user_by_name():
    repo = StubUserRepository()
    greeter = UserGreeter(repo)
    assert greeter.greet(1) == "Hello, Alice!"
```

### Spy
A stub that also records information about how it was called. Verify interactions after the fact.
```python
class SpyEmailSender:
    def __init__(self):
        self.sent_emails = []

    def send(self, to, subject, body):
        self.sent_emails.append({"to": to, "subject": subject, "body": body})

def test_sends_welcome_email():
    sender = SpyEmailSender()
    service = RegistrationService(sender)
    service.register("alice@example.com")
    assert len(sender.sent_emails) == 1
    assert sender.sent_emails[0]["to"] == "alice@example.com"
    assert "Welcome" in sender.sent_emails[0]["subject"]
```

### Mock
Pre-programmed with expectations. The test fails if expected interactions don't happen. Mocks verify behavior.
```python
# Using a mock framework
def test_saves_order_to_repository():
    repo = Mock()
    service = OrderService(repo)
    service.place_order(order)
    repo.save.assert_called_once_with(order)
```

### Fake
A working implementation that takes shortcuts (e.g., in-memory database instead of real one).
```python
class FakeUserRepository:
    def __init__(self):
        self.users = {}

    def save(self, user):
        self.users[user.id] = user

    def find_by_id(self, id):
        return self.users.get(id)
```

## When to Use What

| Double | Use When | Verifies |
|--------|----------|----------|
| Dummy | Filling required params | Nothing |
| Stub | Controlling indirect inputs | State |
| Spy | Verifying indirect outputs | Behavior (after) |
| Mock | Enforcing interaction contracts | Behavior (during) |
| Fake | Need realistic behavior without real infra | State + behavior |

## Principles

### Prefer stubs over mocks for most tests
Mocks couple tests to implementation. If you change how a method achieves its result (but the result is the same), mock-heavy tests break. Stub-based tests don't.

### Mock roles, not objects
Don't mock concrete classes. Mock interfaces/protocols. This ensures you're testing against a contract, not an implementation.

### Don't mock what you don't own
Wrapping third-party libraries in your own adapter and mocking THAT is better than mocking the library directly. Libraries change their API; your adapter insulates you.

### One mock per test (usually)
If a test needs many mocks, the unit under test probably has too many dependencies (SRP violation).

## Anti-Patterns

### Mock Mania
Mocking everything, including value objects and simple data structures. Only mock at architectural boundaries.

### Testing the Mock
When your test primarily verifies mock setup rather than real behavior. Sign: the test reads like configuration, not a specification.

### Implementation Coupling
Tests that break when you refactor internal implementation without changing external behavior. Usually caused by over-mocking.
