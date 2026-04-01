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
