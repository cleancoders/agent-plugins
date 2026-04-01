# Comments and Formatting

## Comments

> "Don't comment bad code -- rewrite it."
> -- Brian W. Kernighan and P. J. Plaugher

### The Truth About Comments

Comments are, at best, a necessary evil. The proper use of comments is to compensate for our failure to express ourselves in code. A comment is a failure to write self-documenting code.

Comments lie. Code changes; comments don't always follow. The older a comment is, the more likely it is wrong.

### Good Comments (rare)

**Legal comments**: Copyright, license headers.

**Informative comments**: Explaining regex patterns or complex algorithms.
```python
# Matches: "yyyy-mm-dd" format
pattern = re.compile(r"\d{4}-\d{2}-\d{2}")
```

**Explanation of intent**: Why, not what.
```python
# We sort by last name because the client specifically requested
# alphabetical reports by family name, not given name.
users.sort(key=lambda u: u.last_name)
```

**Warning of consequences**:
```python
# Don't run unless you have 30 minutes to spare
def test_massive_data_migration():
    ...
```

**TODO comments**: Acceptable if they reference a ticket/issue and are regularly cleaned up.

### Bad Comments (most of them)

**Mumbling**: Comments that don't add clarity.
```python
# Set the port
self.port = 8080  # we know, we can read
```

**Redundant comments**: Restate the code.
```python
# Returns the day of the month
def get_day_of_month():
    return day_of_month
```

**Mandated comments**: Every function/variable must have a doc comment -- leads to noise.

**Journal comments**: Changelog in the file header. That's what git is for.

**Noise comments**: `# Default constructor` -- adds nothing.

**Commented-out code**: Delete it. Version control has it if you need it.

**Position markers**: `# ============ ACTIONS ============` -- if you need section markers, your file is too long.

**Closing brace comments**: `} // end if` -- if you need these, your blocks are too long.

## Formatting

### Vertical Formatting

**The Newspaper Metaphor**: Read top-down. The headline (class/module name) tells the story. The first paragraph (public API) gives the synopsis. Details increase as you read down.

**Vertical openness**: Separate concepts with blank lines.
```python
# Good - blank lines separate concepts
def calculate_pay(employee):
    base = employee.salary

    overtime = calculate_overtime(employee)

    return base + overtime
```

**Vertical density**: Related lines should be close together.
```python
# Bad - separating related things
class ReporterConfig:
    # The class name of the reporter listener
    reporter_listener_class_name = ""

    # The properties of the reporter listener
    properties = []

# Good - related things together
class ReporterConfig:
    reporter_listener_class_name = ""
    properties = []
```

**Vertical distance**: Concepts that are closely related should be vertically close. Don't make the reader jump around the file.
- Variables: declare as close to usage as possible
- Instance variables: at the top of the class
- Dependent functions: caller above callee (stepdown rule)

### Horizontal Formatting

**Line length**: Keep under 120 characters. Prefer 80-100.

**Horizontal openness**: Use whitespace to associate and disassociate.
```python
# Operators spaced to show precedence
area = width * height
determinant = a*b - c*d  # multiplication binds tighter

# Assignment separated from expression
total = calculate_pay(employee)
```

**Indentation**: Shows scope hierarchy. Never collapse it for "brevity."

### Team Rules

A team of developers should agree on a single formatting style and everyone should use it. Consistency within a codebase is more important than any individual preference.
