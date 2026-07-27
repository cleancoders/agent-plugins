# Exceptional-conditions classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.

OWASP A10 Mishandling of Exceptional Conditions is new in the 2025 edition and maps
unusually well onto Clojure: CWE-396 is literally `(catch Exception e ...)`, and
CWE-636 is a permissive default returned from a swallowed security decision.

### spec-malli-leak

Spec / Malli error messages leaking data.

`s/explain-data` and Malli's humanizers include the offending value. In a 4xx response body, that's a free dump of internal structures and likely PII.

**Fix:** Strip values, generalize messages, or use a middleware that maps validation failures to a flat `{"errors": ["field is required"]}` shape. Never return raw `explain-data` to clients.

**Grep:**
```
explain-data
m/explain
me/humanize
```

### fail-open

**CWE-636, CWE-396 · OWASP A10**

A `catch` around a security decision that returns a permissive default. The error
path grants what the success path would have denied — so any way to *break* the
check becomes a way to *pass* it.

```clojure
;; Vulnerable — an exception in the permission lookup grants access
(defn authorized? [user]
  (try (check-permissions user)
       (catch Exception _ true)))

;; Vulnerable — swallows the error and the caller reads nil as "no problem"
(defn audit! [event]
  (try (write-audit-log! event)
       (catch Exception _ nil)))

;; Safe — narrow catch, logged, fails closed
(defn authorized? [user]
  (try (check-permissions user)
       (catch java.sql.SQLException e
         (log/warn e "permission lookup failed")
         false)))
```

**Grep:**
```
\(catch\s+(Exception|Throwable)\s+\S+\s+true\)
\(catch\s+(Exception|Throwable)\s+_\s+nil\)
\(catch\s+Throwable
```

**False positives:** a generic catch around a genuinely optional side effect
(cache warming, metrics emission) where a permissive default is correct. The test
is whether the guarded expression influences a security decision.

**Fix direction:** catch the narrowest exception type that can actually occur, log
it, and return the restrictive value. If you cannot enumerate the exception types,
that uncertainty is itself the argument for failing closed.

**Severity floor:** High when the swallowed expression is a security check.
Critical when it guards authentication or authorization directly. Low for a
genuinely optional side effect.
