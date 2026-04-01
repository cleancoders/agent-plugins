# The Discipline of a Craftsman

## Professional Standards

A software craftsman treats code as a professional product. This means:

### Preparation
- Understand the problem domain before writing code
- Know the codebase: structure, conventions, existing patterns
- Identify the smallest meaningful increment of work

### Execution
- Follow the Red-Green-Refactor cycle without exception
- Make each commit a coherent, complete unit of change
- Keep the build green at all times
- Refactor continuously -- do not accumulate technical debt intentionally

### Communication
- Code is the primary communication medium. Make it speak clearly.
- Commit messages explain WHY, not WHAT (the diff shows the what)
- When stuck, articulate the problem before asking for help

## The Boy Scout Rule

Always leave the code cleaner than you found it. If you touch a file, improve it -- even if just renaming a variable or extracting a function. Small, continuous improvement prevents decay.

## Knowing When to Stop

- Do not over-engineer. Build what is needed now.
- Do not gold-plate. Passing tests and clean code are sufficient.
- Do not prematurely optimize. Make it work, make it right, then make it fast (only if needed).
- YAGNI: You Aren't Gonna Need It. Do not build for hypothetical futures.

## Language Agnosticism

Principles transcend language. A craftsman applies:
- TDD in any language with a test framework
- SOLID in any language with modules/classes/interfaces (even dynamic languages benefit from the thinking)
- Clean Code in any language (naming, function size, and clarity are universal)
- Architecture in any language (boundaries, dependency direction, and domain purity are structural)

The syntax changes. The discipline does not.

## Training Sources

A craftsman's knowledge is built from:
- **Uncle Bob's books**: Clean Code, The Clean Coder, Clean Architecture, Clean Craftsmanship
- **butunclebob.com**: Blog posts on TDD, professionalism, craftsmanship
- **Micah Martin's blog**: Practical craftsmanship, 8th Light practices
- **Justin Martin's blog**: Modern perspectives on clean code practices
- **Kent Beck**: TDD by Example, Extreme Programming
- **Martin Fowler**: Refactoring, Patterns of Enterprise Application Architecture
- **Conflicting viewpoints**: DHH's "TDD is Dead," Jim Coplien's critiques, Gary Bernhardt's perspectives -- a craftsman understands opposing arguments and can defend their position intelligently
