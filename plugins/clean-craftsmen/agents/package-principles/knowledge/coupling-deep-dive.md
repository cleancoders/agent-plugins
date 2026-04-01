# Package Coupling Principles - Deep Dive

## ADP: Acyclic Dependencies Principle

"Allow no cycles in the component dependency graph."

### What Cycles Look Like
```
Package A depends on Package B
Package B depends on Package C
Package C depends on Package A  <-- CYCLE
```

### Why Cycles Are Harmful
- You cannot build A without building C, which requires B, which requires A.
- A change to ANY package in the cycle potentially affects ALL packages in the cycle.
- Testing becomes difficult: you cannot test A in isolation from B and C.
- Releases become tangled: you must release all packages in the cycle together.

### Breaking Cycles

**Strategy 1: Dependency Inversion (DIP)**
- If C depends on A, extract an interface that A implements.
- Put the interface in C (or in a new package D).
- Now C depends on the interface (in D), and A implements it.
- The cycle is broken: A -> B -> C -> D <- A

**Strategy 2: Extract a New Package**
- Identify the classes that cause the cycle.
- Extract them into a new package that both sides depend on.
- A -> B -> C -> NewPackage <- A

### Detecting Cycles
- Draw the dependency graph. Any cycle means the principle is violated.
- Tools: dependency analysis tools in most IDEs, or custom scripts that trace imports.
- In a CI pipeline, a dependency cycle check can be automated.

Source: "Clean Architecture" Chapter 14, "Agile Software Development" by Robert C. Martin

## SDP: Stable Dependencies Principle

"Depend in the direction of stability."

### Defining Stability

Uncle Bob defines stability mathematically:

- **Fan-in**: Number of incoming dependencies (other packages that depend on this one).
- **Fan-out**: Number of outgoing dependencies (packages this one depends on).
- **Instability (I)** = Fan-out / (Fan-in + Fan-out)
  - I = 0: Maximally stable (many dependents, no dependencies). Hard to change.
  - I = 1: Maximally unstable (no dependents, many dependencies). Easy to change.

### The Rule
- A package with I = 0.2 (stable) should NOT depend on a package with I = 0.8 (unstable).
- Stable packages are hard to change. If they depend on unstable packages, they become vulnerable to those changes.
- Unstable packages SHOULD depend on stable ones. Their instability allows them to adapt when stable packages change (which should be rare).

### Practical Implication
- Your domain/core packages should be STABLE: many things depend on them, they depend on few things.
- Your UI, web framework, and database adapter packages should be UNSTABLE: they depend on the domain but few things depend on them.
- This aligns perfectly with Clean Architecture's dependency rule.

### When Stability Is Forced
- If a package MUST be stable (many dependents) but also needs to change frequently, apply SAP: make it abstract.
- An abstract package can be stable AND changeable (new implementations, not modifications).

## SAP: Stable Abstractions Principle

"A component should be as abstract as it is stable."

### Defining Abstractness

- **Abstractness (A)** = Number of abstract classes and interfaces / Total number of classes
  - A = 0: Fully concrete. No abstract classes or interfaces.
  - A = 1: Fully abstract. Only interfaces and abstract classes.

### The Rule
- Stable packages (I near 0) should have high abstractness (A near 1).
- Unstable packages (I near 1) should have low abstractness (A near 0).
- In other words: stable = abstract, unstable = concrete.

### Why
- A stable, concrete package is in the **Zone of Pain**: hard to change (many dependents) and no abstraction to extend. Any modification risks breaking dependents.
- An unstable, abstract package is in the **Zone of Uselessness**: nobody depends on it, and it has no concrete implementation. What is it for?

## The Main Sequence

Plot packages on a graph: X = Abstractness, Y = Instability.

```
I (Instability)
1 |  Zone of         *    *
  |  Uselessness   *   *
  |              *  *
  |           *  *        <- The Main Sequence
  |        *  *
  |     *  *
  |   *  *    Zone of
0 | *        Pain
  +-------------------
  0                    1
        A (Abstractness)
```

**The Main Sequence** is the line from (0,1) to (1,0).

- **Distance from the Main Sequence (D)** = |A + I - 1|
  - D = 0: Perfectly on the Main Sequence.
  - D > 0: Off the line, in a zone of concern.

### Interpreting D
- Packages with high D are in trouble: either in the Zone of Pain or the Zone of Uselessness.
- Track D over time. A package drifting away from the Main Sequence is a design smell.

## Applying to Clean Architecture

| Layer | Expected Stability | Expected Abstractness | Main Sequence Position |
|-------|-------------------|----------------------|----------------------|
| Domain/Entities | High (I near 0) | High (A near 1) | Top-left |
| Use Cases | Medium | Medium | Center |
| Interface Adapters | Medium-Low | Low-Medium | Center-right |
| Frameworks/Drivers | Low (I near 1) | Low (A near 0) | Bottom-right |

This is Clean Architecture expressed through package metrics.

## Training Sources
- "Clean Architecture" Chapters 13-14 -- Robert C. Martin
- "Agile Software Development: Principles, Patterns, and Practices" -- Robert C. Martin (original formulation with metrics)
- butunclebob.com -- the earliest articles on these metrics
- Conflicting: "These metrics are too academic; nobody actually calculates I, A, and D." Uncle Bob: You do not need to calculate them precisely. The THINKING behind them guides good design. But tools CAN calculate them, and they are useful for large codebases.
