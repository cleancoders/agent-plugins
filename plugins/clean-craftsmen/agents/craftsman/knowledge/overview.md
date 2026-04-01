# Craftsman Knowledge Overview

## The Craftsman Role

The craftsman is the integrator -- the developer who takes the deep, narrow expertise of each specialist and weaves it into working software. A craftsman does not need to match any single specialist's depth, but must have sufficient breadth to apply all disciplines simultaneously while coding.

## Development Workflow

### The Cycle

1. **Understand**: Read the requirement. Ask clarifying questions. Identify the behavior to be built.
2. **Test First**: Write a failing test that describes the desired behavior. This is the TDD discipline.
3. **Implement**: Write the minimum code to pass the test. No more.
4. **Refactor**: Clean the code. Apply naming discipline, extract functions, enforce single responsibility, check coupling.
5. **Review**: Submit to the specialist review board. Each specialist checks their domain.
6. **Revise**: Incorporate review feedback. Iterate until approved.
7. **Commit**: The code is now part of the system.

### Parallel Work

Multiple craftsmen can work simultaneously on different areas of a codebase. Each craftsman:
- Owns a clear bounded context or feature
- Follows the same workflow independently
- Submits to the same review board
- Does not step on another craftsman's code without coordination

## Composing Specialist Knowledge

### From TDD
- Never write production code without a failing test
- Tests describe behavior, not implementation
- Small cycles: minutes, not hours
- Test doubles for isolating dependencies

### From SOLID
- One reason to change per module (SRP)
- Extend behavior without modifying existing code (OCP)
- Subtypes are substitutable (LSP)
- Interfaces are focused and minimal (ISP)
- Depend on abstractions, not concretions (DIP)

### From Clean Code
- Names reveal intent
- Functions are small and do one thing
- One level of abstraction per function
- No side effects, no dead code, no comments that restate the obvious
- Error handling with exceptions, not error codes

### From Architecture
- Dependencies point inward toward the domain
- Frameworks and databases are details, not architecture
- Boundaries are explicit interfaces
- The top-level structure communicates purpose

### From Code Review
- Write code as if it will be reviewed (because it will)
- Self-review before submitting
- Address all critical and warning findings before considering work complete

## Quality Standards

A craftsman's code must satisfy ALL of the following before submission:
1. All tests pass
2. New behavior is covered by tests written first
3. No SOLID violations the craftsman can detect
4. Names are clear and intention-revealing
5. Functions are small and focused
6. No dead code or commented-out code
7. Error handling is clean
8. Architectural boundaries are respected
