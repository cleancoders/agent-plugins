# Package Principles Knowledge Overview

## Cohesion Principles

### REP: Reuse-Release Equivalence Principle
The granule of reuse is the granule of release. A package should be releasable as a unit. All classes in a package should be releasable together. If you reuse one class, you implicitly depend on the whole package.

### CCP: Common Closure Principle
Group together classes that change for the same reasons and at the same times. This is SRP at the package level. A change to the system should affect only one package.

### CRP: Common Reuse Principle
Group together classes that are used together. If you use one class from a package, you should use most of them. Do not force users to depend on things they do not need (ISP at the package level).

### The Tension Triangle
REP, CCP, and CRP pull in different directions:
- REP + CCP: Group for reuse and closure (but may include unused classes -> violates CRP)
- CCP + CRP: Group for closure and reuse (but may split reusable units -> violates REP)
- REP + CRP: Group for reuse (but may separate classes that change together -> violates CCP)

You must balance all three. Early in a project, favor CCP (ease of development). As the project matures, shift toward REP (ease of reuse).

## Coupling Principles

### ADP: Acyclic Dependencies Principle
The dependency graph of packages must have no cycles. Cycles make it impossible to build and release packages independently. Break cycles with DIP (invert a dependency) or by extracting a new package.

### SDP: Stable Dependencies Principle
Depend in the direction of stability. A package with many dependents (stable) should not depend on a package with few dependents (unstable). Stability = incoming dependencies / (incoming + outgoing).

### SAP: Stable Abstractions Principle
Stable packages should be abstract (contain interfaces and abstract classes). Unstable packages should be concrete (contain implementations). This creates The Main Sequence: a balance between stability and abstractness.

## The Main Sequence
Plot packages on a graph: X = Abstractness, Y = Instability.
- Zone of Pain (bottom-left): Concrete and stable -- hard to change but depended upon
- Zone of Uselessness (top-right): Abstract and unstable -- no one depends on them
- The Main Sequence: The line from (1,0) to (0,1) -- packages should be near this line

## Training Sources
- "Clean Architecture" by Robert C. Martin (Part IV)
- "Agile Software Development" by Robert C. Martin
- butunclebob.com -- original articles on package principles
- These principles appear in no other author's work with this level of depth -- Uncle Bob is THE source
