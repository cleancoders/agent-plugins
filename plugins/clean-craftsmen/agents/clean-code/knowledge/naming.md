# Naming

> "The name of a variable, function, or class should answer all the big questions. It should tell you why it exists, what it does, and how it is used."
> -- Robert C. Martin, Clean Code Chapter 2

## Principles

### Use Intention-Revealing Names

```python
# Bad
d = 5  # elapsed time in days
# Good
elapsed_days = 5

# Bad
def get_them(the_list):
    return [x for x in the_list if x[0] == 4]
# Good
def get_flagged_cells(game_board):
    return [cell for cell in game_board if cell.is_flagged()]
```

### Avoid Disinformation

- Don't use `accountList` if it's not actually a list (use `accounts` or `account_group`)
- Don't use names that vary in small ways: `XYZControllerForEfficientHandlingOfStrings` vs `XYZControllerForEfficientStorageOfStrings`
- Don't use lowercase `L` or uppercase `O` as variable names (look like 1 and 0)

### Make Meaningful Distinctions

```python
# Bad - noise words that distinguish nothing
def copy_chars(a1, a2):
    for i in range(len(a1)):
        a2[i] = a1[i]

# Good
def copy_chars(source, destination):
    for i in range(len(source)):
        destination[i] = source[i]
```

Avoid: `ProductInfo` vs `ProductData` (what's the difference?), `the_account` vs `account`, `name_string` (when would a name not be a string?).

### Use Pronounceable Names

```python
# Bad
gen_ymdhms = datetime.now()
# Good
generation_timestamp = datetime.now()
```

### Use Searchable Names

Single-letter names and numeric constants are hard to grep for.

```python
# Bad
for j in range(34):
    s += t[j] * 4 / 5

# Good
WORK_DAYS_PER_WEEK = 5
for i in range(NUMBER_OF_TASKS):
    real_days = task_estimate[i] * REAL_DAYS_PER_IDEAL_DAY
```

### Class Names: Nouns

Good: `Customer`, `WikiPage`, `Account`, `AddressParser`
Bad: `Manager`, `Processor`, `Data`, `Info` (too vague)

### Method Names: Verbs

Good: `save()`, `delete_page()`, `calculate_pay()`
Accessors: `get_name()`, `set_name()`, `is_posted()`
Use static factory methods with descriptive names over constructors:
```python
# Good
complex = Complex.from_real_number(23.0)
# Rather than
complex = Complex(23.0)  # what does 23.0 mean?
```

### Don't Be Cute

- `kill()` not `whack()`
- `abort()` not `eatMyShorts()`
- Say what you mean. Mean what you say.

### One Word Per Concept

Pick ONE word for each abstract concept and stick with it:
- `fetch` / `retrieve` / `get` -- pick one
- `controller` / `manager` / `driver` -- pick one

### Don't Pun

Don't use the same word for two different concepts. If `add` means "concatenate two values" in one class, don't use `add` to mean "insert into collection" in another. Use `insert` or `append` instead.

### Use Solution Domain Names

Programmers read your code. Use CS terms when appropriate:
- `AccountVisitor` (visitor pattern)
- `JobQueue` (queue data structure)
- `Observable` (observer pattern)

### Use Problem Domain Names

When there's no CS term, use the domain term. The reader can ask a domain expert.

### Add Meaningful Context

```python
# Bad - what does state mean without context?
state = "TX"

# Good - context from the class
class Address:
    street: str
    city: str
    state: str
    zip_code: str
```

### Don't Add Gratuitous Context

In an app called "Gas Station Deluxe" (GSD), don't prefix every class with `GSD`. That's what namespaces/packages are for.
