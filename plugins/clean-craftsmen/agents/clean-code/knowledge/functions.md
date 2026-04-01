# Functions

> "The first rule of functions is that they should be small. The second rule of functions is that they should be smaller than that."
> -- Robert C. Martin, Clean Code Chapter 3

## Principles

### Small

Functions should be 5-15 lines. If a function scrolls past one screen, it's too long. Blocks within if/else/while statements should be one line -- usually a function call. This keeps the enclosing function small and adds documentary value (the called function has a descriptive name).

### Do One Thing

> "Functions should do one thing. They should do it well. They should do it only."

How to tell if a function does one thing: can you extract another function from it with a name that is not merely a restatement of its implementation?

```python
# Does more than one thing
def pay_employee(employee):
    calculate_pay(employee)
    verify_tax_info(employee)
    send_payment(employee)
    log_payment(employee)

# Each sub-function does one thing
```

### One Level of Abstraction

Mixing high-level and low-level operations in the same function is confusing.

```python
# Bad - mixed abstraction levels
def render_page():
    page_name = path_name.split("/")[-1]  # low-level string parsing
    setup_page()                           # high-level
    html = f"<html>{page_content}</html>"  # low-level HTML
    return html

# Good - consistent abstraction
def render_page():
    page_name = parse_page_name(path_name)
    setup_page(page_name)
    return render_html(page_content)
```

### Reading Code Top-Down: The Stepdown Rule

Code should read like a top-down narrative. Each function should be followed by those at the next level of abstraction.

```
- To render the page, we parse the name, set it up, and render HTML.
  - To parse the page name, we split the path.
  - To set up the page, we load the template.
  - To render HTML, we wrap content in tags.
```

### Function Arguments

Ideal: zero (niladic). Next best: one (monadic). Then two (dyadic). Three (triadic) should be avoided. More than three: extract an object.

**Monadic forms** (one argument):
- Asking a question: `file_exists("myFile")`
- Transforming: `file_open("myFile")` returns a file handle
- Event: `password_attempt_failed(attempt)` -- no return value

**Flag arguments are ugly**: `render(True)` -- what does True mean? Split into two functions: `render_for_suite()` and `render_for_single_test()`.

**Dyadic** (two arguments): Acceptable when arguments have natural ordering (`Point(x, y)`) or are clearly different things (`assertEquals(expected, actual)`).

### Have No Side Effects

A function that promises to do one thing but also does something else is lying.

```python
# Side effect: session initialization hidden inside password check
def check_password(user, password):
    user_obj = find_user(user)
    if user_obj.password_matches(password):
        Session.initialize()  # SIDE EFFECT!
        return True
    return False
```

### Command-Query Separation

Functions should either DO something (command) or ANSWER something (query), never both.

```python
# Bad - does it set the attribute, or check if it was set?
if set("username", "uncle_bob"):
    ...

# Good - separated
if attribute_exists("username"):
    set_attribute("username", "uncle_bob")
```

### Prefer Exceptions to Error Codes

```python
# Bad - error codes force nested if/else
if delete_page(page) == OK:
    if registry.delete_reference(page.name) == OK:
        if config_keys.delete_key(page.name.make_key()) == OK:
            logger.log("page deleted")
        else:
            logger.log("config key not deleted")
    else:
        logger.log("reference not deleted from registry")
else:
    logger.log("delete failed")

# Good - exceptions
try:
    delete_page(page)
    registry.delete_reference(page.name)
    config_keys.delete_key(page.name.make_key())
except Exception as e:
    logger.log(e.message)
```

### Extract Try/Catch Blocks

Error handling is one thing. Extract the body of try and catch into their own functions.

```python
def delete(page):
    try:
        delete_page_and_all_references(page)
    except Exception as e:
        log_error(e)

def delete_page_and_all_references(page):
    delete_page(page)
    registry.delete_reference(page.name)
    config_keys.delete_key(page.name.make_key())
```

### Don't Repeat Yourself (DRY)

Duplication is the root of all evil in software. If you see the same code structure in two places, extract it.
