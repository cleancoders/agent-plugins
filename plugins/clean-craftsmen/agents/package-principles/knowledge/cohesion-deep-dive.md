# Package Cohesion Principles - Deep Dive

## REP: Reuse-Release Equivalence Principle

"The granule of reuse is the granule of release."

### What It Means
- If you want to reuse a class, you must accept the entire package it lives in.
- Therefore, classes in a package must be REUSABLE TOGETHER.
- A package should be releasable as a versioned unit. If class A changes, the whole package gets a new version.
- Users of the package should be able to decide whether to upgrade.

### Practical Implication
- Do not put classes in the same package unless they can all be reused together.
- A package with `EmailSender`, `SMSNotifier`, and `PushNotifier` makes sense (notification reuse unit).
- A package with `EmailSender`, `TaxCalculator`, and `ImageResizer` does NOT (no coherent reuse story).

Source: "Clean Architecture" Part IV, "Agile Software Development" by Robert C. Martin

## CCP: Common Closure Principle

"Gather into components those classes that change for the same reasons and at the same times."

### What It Means
- This is SRP at the package level.
- If a change to the system requires modifying classes, those classes should be in the SAME package.
- Ideally, a change affects only ONE package.
- This minimizes the number of packages that need to be redeployed when a change occurs.

### Practical Implication
- Group classes by business concern, not by technical layer.
- A change to "how discounts work" should affect the `pricing` package, not `pricing`, `models`, `controllers`, and `views`.
- This directly supports Clean Architecture's idea of organizing by use case / feature.

### CCP vs. Layered Architecture
- Layered architecture (controllers, services, repositories) violates CCP: a business change touches all layers.
- Feature/vertical slicing respects CCP: `billing/`, `users/`, `orders/` each contain their own models, services, and repositories.

## CRP: Common Reuse Principle

"Don't force users of a component to depend on things they don't need."

### What It Means
- This is ISP at the package level.
- If a user depends on your package, they should use MOST of what's in it.
- If they only use one class and ignore the rest, the package is too big or the class is in the wrong package.
- When a class the user does NOT use changes, the user must still re-validate and potentially redeploy.

### Practical Implication
- Split large utility packages into focused packages.
- `StringUtils`, `DateUtils`, `MathUtils` in one package -> user depends on all three even if they only use `StringUtils`.
- Better: separate packages per utility concern, or better yet, use standard library equivalents.

## The Tension Triangle

REP, CCP, and CRP are in TENSION. You cannot satisfy all three perfectly.

```
        REP
       /    \
      /      \
    CCP --- CRP
```

- **REP + CCP** (left edge): Group for reuse and closure. May include things not everyone uses (violates CRP).
- **CCP + CRP** (bottom edge): Group for closure and focused reuse. May split things that should be released together (violates REP).
- **REP + CRP** (right edge): Group for reuse. May separate things that change together (violates CCP).

### The Tradeoff Over Time
- **Early in a project**: Favor CCP. Development speed matters. Minimize the cost of change.
- **As the project matures**: Shift toward REP and CRP. Reusability and focused dependencies matter more.
- **In a shared library**: REP and CRP dominate. Users should not be forced to depend on things they do not use.

Uncle Bob in "Clean Architecture": "These three principles are the forces that an architect must balance when partitioning classes into packages."

## Training Sources
- "Clean Architecture" Part IV -- Robert C. Martin (the primary modern source)
- "Agile Software Development: Principles, Patterns, and Practices" -- Robert C. Martin (the original formulation)
- butunclebob.com -- original articles on package principles
- Conflicting: "Microservices solve this by making each service its own package." Uncle Bob: microservices are a deployment strategy, not an architecture. The same principles apply within each service.
