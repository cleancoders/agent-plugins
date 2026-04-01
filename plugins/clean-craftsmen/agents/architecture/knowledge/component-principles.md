# Component Principles

Robert C. Martin defines six principles for organizing code into components (packages, modules, libraries).

## Cohesion Principles (what goes inside a component)

### Common Closure Principle (CCP)
> "Gather together those things that change at the same time and for the same reasons. Separate those things that change at different times or for different reasons."

This is SRP at the component level. A component should not have multiple reasons to change.

**Example**: Don't put database access code and business rules in the same component if they change for different reasons.

### Common Reuse Principle (CRP)
> "Don't force users of a component to depend on things they don't need."

This is ISP at the component level. If you use one class from a component, you should need most of the other classes too.

**Example**: Don't put logging utilities and math utilities in the same component. A project that needs math shouldn't be forced to depend on logging.

### Reuse/Release Equivalence Principle (REP)
> "The granule of reuse is the granule of release."

Components that are reused together should be released together. They should share the same version number and release cycle.

## Coupling Principles (relationships between components)

### Acyclic Dependencies Principle (ADP)
> "Allow no cycles in the component dependency graph."

If A depends on B, and B depends on C, and C depends on A -- you have a cycle. Cycles make it impossible to build, test, or release components independently.

**Breaking cycles**:
1. Apply DIP: introduce an interface that inverts one of the dependencies
2. Create a new component that both depend on

```
Before (cycle):     A -> B -> C -> A

After (DIP):        A -> B -> C -> InterfaceX
                    A implements InterfaceX
```

### Stable Dependencies Principle (SDP)
> "Depend in the direction of stability."

A component that many others depend on should be stable (hard to change). A component that depends on many others should be unstable (easy to change).

**Stability metric**: I = Fan-out / (Fan-in + Fan-out)
- I = 0: maximally stable (everyone depends on it, it depends on nothing)
- I = 1: maximally unstable (it depends on everything, nothing depends on it)

Depend on things with LOWER I (more stable) than you.

### Stable Abstractions Principle (SAP)
> "A component should be as abstract as it is stable."

Stable components should be abstract (interfaces, abstract classes) so they can be extended without modification (OCP). Unstable components should be concrete -- they're easy to change anyway.

The combination of SDP + SAP means: **depend on abstractions**.

## The Main Sequence

Plot components on a graph: Abstractness (A) vs. Instability (I).

```
  A=1 |  Zone of     /  Ideal
      |  Uselessness / (Main Sequence)
      |            /
      |          /
      |        /
      |      /
      |    /
      |  / Zone of Pain
  A=0 +------------------
      I=0              I=1
```

- **Zone of Pain** (I=0, A=0): Stable AND concrete. Hard to change. Database schemas live here.
- **Zone of Uselessness** (I=1, A=1): Unstable AND abstract. No one depends on it.
- **Main Sequence** (diagonal): The ideal. Abstract components are stable; concrete components are unstable.

## Practical Application

When organizing a codebase:
1. Group by feature/domain (CCP), not by technical layer
2. Make each component independently deployable and testable
3. Ensure the dependency graph is a DAG (no cycles)
4. Put abstractions in stable components, implementations in unstable ones
