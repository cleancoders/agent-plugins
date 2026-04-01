# Craftsman Pair Programming & Collaboration Protocol

## Overview

Craftsman agents are not solo practitioners by default. They are designed to collaborate -- pairing, mobbing, and debating with other craftsmen to produce superior solutions. This protocol defines how two or more craftsmen work together on the same problem.

The inspiration comes from Extreme Programming (Kent Beck), the software craftsmanship movement (Robert C. Martin, Corey Haines), and mob programming (Woody Zuill). The key insight: **two minds on one problem produce better code than one mind alone**, provided the collaboration is structured.

## Collaboration Modes

### 1. Pair Programming (Two Craftsmen)

#### Driver/Navigator Pattern

The foundational pairing mode. One craftsman drives (writes code), the other navigates (thinks strategically).

**Driver responsibilities:**
- Controls the keyboard. Writes the actual code and tests.
- Focuses on tactical decisions: syntax, immediate implementation, making the current test pass.
- Verbalizes intent before typing: "I'm going to extract this into a method called `calculateDiscount`."
- Asks the navigator for input on naming, structure, next steps.

**Navigator responsibilities:**
- Does NOT touch the keyboard. Thinks at a higher abstraction level.
- Watches for bugs, design violations, naming issues in real-time.
- Plans ahead: "After this test passes, we should think about the error case."
- Challenges decisions: "Why a class here instead of a function? What's the SRP argument?"
- Tracks the bigger picture: architectural fit, test coverage gaps, SOLID compliance.

**Rotation protocol:**
- Rotate after every Red-Green-Refactor cycle (approximately every 5-15 minutes of work).
- The new driver picks up exactly where the old driver left off.
- Rotation is mandatory, not optional. Both craftsmen must drive and navigate.

#### Ping-Pong TDD Pattern

The most natural pairing pattern for TDD practitioners. Directly from Kent Beck's practice.

**Protocol:**
1. Craftsman A writes a failing test (RED).
2. Craftsman B makes it pass with minimum code (GREEN) and writes the next failing test (RED).
3. Craftsman A makes it pass (GREEN) and writes the next failing test (RED).
4. Either craftsman can call a REFACTOR pause at any green state.
5. Both craftsmen collaborate on refactoring decisions, then resume ping-pong.

**Why this works:**
- Forces both craftsmen to engage with both test code and production code.
- The test-writer thinks about behavior and edge cases. The implementer thinks about design.
- Creates natural rhythm and prevents one craftsman from dominating.
- Each failing test is a micro-specification that the partner must satisfy.

#### Strong-Style Pairing

"For an idea to go from your head into the computer, it MUST go through the other person's hands." -- Llewellyn Falco

**Protocol:**
- The navigator dictates intent at a high level: "We need a function that validates the email format."
- The driver decides implementation: chooses the algorithm, writes the code.
- If the navigator disagrees with the implementation, they explain WHY, and the driver decides whether to change.
- The navigator NEVER takes the keyboard. Their ideas flow through the driver's fingers.

**Best for:**
- When one craftsman has more domain knowledge (they navigate, the other drives).
- When exploring unfamiliar territory (the more cautious craftsman navigates).
- When the pair keeps getting stuck in implementation details (strong-style forces higher-level thinking).

### 2. Discussion / Debate Protocol (Pre-Implementation)

Before writing any code, craftsmen can enter a structured discussion to evaluate approaches. This is the "thinking before typing" discipline.

#### Proposal Phase
1. Each craftsman independently proposes an approach. The proposal must include:
   - **Design**: How would the code be structured?
   - **Tests**: What would the first 3 tests be?
   - **Trade-offs**: What does this approach sacrifice?
   - **SOLID alignment**: Which principles does this approach serve best?
   - **Risk**: What could go wrong?

#### Challenge Phase
2. Each craftsman critiques the other's proposal:
   - "Your approach violates OCP because adding a new type requires modifying the switch statement."
   - "The first test you propose doesn't actually test the behavior -- it tests the implementation."
   - "This design couples the domain to the persistence layer."
   - Challenges must cite specific principles (SOLID, Clean Code, TDD, Architecture).
   - No ad hominem. Critique the approach, not the craftsman.

#### Convergence Phase
3. The craftsmen synthesize:
   - Identify areas of agreement. Start there.
   - For disagreements, apply the **"Try Both"** rule: if the disagreement can be resolved by trying both approaches for one TDD cycle (5 minutes each), do that. Let the code speak.
   - If one approach is clearly superior after trying both, adopt it.
   - If both are viable, prefer the simpler one (KISS / YAGNI).
   - Document the rejected approach and why -- this is valuable knowledge.

#### Decision Record
4. The pair records their decision:
   - **Chosen approach**: Brief description
   - **Rejected approach(es)**: What and why
   - **Key principle**: The primary principle that drove the decision
   - **Confidence**: High / Medium / Low (low confidence = revisit after more tests)

### 3. Mob Programming (N Craftsmen)

When more than two craftsmen work on the same problem. Based on Woody Zuill's mob programming principles.

#### Roles

**Driver** (1 craftsman):
- Types code. Does NOT make design decisions independently.
- Follows the navigator's directions.
- Asks for clarification if directions are unclear.
- Rotates every TDD cycle or every 5-10 minutes.

**Navigator** (1 craftsman):
- Directs the driver at the highest useful level of abstraction.
- "Write a test for the case where the input is empty."
- Does NOT dictate syntax: "Type `if input == null`" is too low-level.
- Rotates on the same schedule as the driver (navigator becomes driver, next person becomes navigator).

**Mobbers** (remaining craftsmen):
- Observe and think ahead.
- Can raise a hand to challenge or suggest, but the navigator has final say during their turn.
- Must not interrupt the driver-navigator flow unless they spot a critical error.
- Their primary job: watch for design violations, think about edge cases, prepare for their turn.

#### Mob Rotation Protocol

With N craftsmen, rotation follows a ring:

```
Rotation 1: [A=driver] [B=navigator] [C=mobber] [D=mobber]
Rotation 2: [B=driver] [C=navigator] [D=mobber] [A=mobber]
Rotation 3: [C=driver] [D=navigator] [A=mobber] [B=mobber]
Rotation 4: [D=driver] [A=navigator] [B=mobber] [C=mobber]
```

**Trigger for rotation:**
- After each Red-Green-Refactor cycle completes.
- After 10 minutes maximum, even if mid-cycle (finish the current micro-step first).
- When the navigator requests it ("I want to drive this next part").

#### Mob Decision Making

- **Proposals**: Any mobber can propose during a pause. The navigator decides whether to adopt.
- **Challenges**: Any mobber can challenge during refactoring phases. The mob discusses and votes if needed.
- **Vetoes**: A mobber can veto ONLY if they can cite a specific principle violation. The mob must address the veto before proceeding.
- **Consensus**: If the mob cannot reach consensus in 3 minutes, they apply the "Try Both" rule (as in pair discussion) or the navigator makes the call and they revisit after the next green state.

### 4. Async Collaboration (Craftsmen on Different Tasks)

When craftsmen work on related but separate tasks:

#### Handoff Protocol
- When craftsman A finishes a unit of work that craftsman B depends on, A provides:
  - What was built and why
  - The interface/contract B should code against
  - Any design decisions and their rationale
  - Known limitations or technical debt

#### Cross-Review
- Before submitting to the specialist review board, craftsmen review EACH OTHER's work first.
- A peer craftsman catches different issues than a specialist: integration concerns, consistency, usability.
- Peer review is informal and fast. Specialist review is formal and thorough.

## Communication Protocol

### Message Types

All craftsman-to-craftsman communication uses typed messages:

| Type | Purpose | Example |
|------|---------|---------|
| `PROPOSE` | Suggest an approach | "PROPOSE: Use Strategy pattern for discount calculation" |
| `CHALLENGE` | Question a decision | "CHALLENGE: Strategy is overkill here -- only 2 types. YAGNI." |
| `AGREE` | Accept a proposal/challenge | "AGREE: You're right, simple conditional is cleaner." |
| `COUNTER` | Counter-propose | "COUNTER: Not Strategy, but use a map of type->calculator." |
| `DRIVE` | Take the keyboard (driver action) | "DRIVE: Writing test for empty input case." |
| `NAVIGATE` | Give direction (navigator action) | "NAVIGATE: Next test should cover the boundary condition at 100 items." |
| `ROTATE` | Signal role rotation | "ROTATE: Your turn to drive." |
| `PAUSE` | Request discussion break | "PAUSE: Let's discuss this design choice before continuing." |
| `REFACTOR` | Signal refactoring phase | "REFACTOR: Tests are green. Let's clean up the naming." |
| `VETO` | Block progress on principle grounds | "VETO: This violates DIP -- domain depends on infrastructure." |
| `DECIDE` | Record a decision | "DECIDE: Using constructor injection. Reason: testability + DIP." |
| `HANDOFF` | Transfer context to another craftsman | "HANDOFF: PaymentService is done. Interface: process(order) -> receipt." |

### Communication Rules

1. **Be specific**: "This is bad" is not useful. "This violates SRP because UserService handles both authentication and profile management" is useful.
2. **Cite principles**: Every challenge or veto must reference a named principle (SRP, OCP, YAGNI, etc.).
3. **Propose alternatives**: Do not just criticize. If you challenge, counter-propose.
4. **Time-box debates**: 3 minutes for any single design discussion. If unresolved, try both or the navigator decides.
5. **Ego-less programming**: The code belongs to the pair/mob, not to the individual who typed it. Defend ideas, not authorship.

## Session Lifecycle

### Starting a Pair/Mob Session

1. **Identify the task**: What specific behavior are we building?
2. **Choose the mode**: Pair (driver/navigator, ping-pong, strong-style) or Mob?
3. **Agree on first test**: What is the simplest failing test that moves us toward the goal?
4. **Assign initial roles**: Who drives first? Who navigates?
5. **Begin**: Driver writes the first failing test.

### During a Session

- Follow the chosen pattern strictly for at least 3 full rotation cycles before switching patterns.
- Call PAUSE if the design feels wrong. Discuss. Decide. Resume.
- Track decisions made during the session for the decision record.
- Any craftsman can call REFACTOR at any green state.

### Ending a Session

1. Ensure all tests are green.
2. Perform a final refactoring pass together.
3. Review the decision record: any decisions that need revisiting?
4. Submit to the specialist review board as a pair/mob submission.
5. Document who participated and what approach was taken.

## Anti-Patterns

### In Pairing
- **Backseat driver**: Navigator dictates every keystroke. Fix: Navigate at a higher abstraction level.
- **Disengaged navigator**: Navigator checks out, looks at phone. Fix: Rotate immediately.
- **Keyboard hog**: Driver refuses to rotate. Fix: Rotation is mandatory and time-boxed.
- **Silent pair**: Neither craftsman speaks. Fix: Driver must verbalize intent before typing.
- **Endless debate**: Discussion without progress. Fix: 3-minute time-box, then try or decide.

### In Mobbing
- **Too many cooks**: Everyone talks at once. Fix: Only navigator directs the driver.
- **Spectators**: Mobbers disengage. Fix: Rotation ensures everyone leads soon.
- **Hero driver**: One person drives all complex parts. Fix: Strict rotation regardless of difficulty.
- **Mob groupthink**: Nobody challenges. Fix: Assign a "devil's advocate" role that rotates.

## References

- "Extreme Programming Explained" -- Kent Beck (original pairing advocacy)
- "Pair Programming Illuminated" -- Laurie Williams & Robert Kessler
- "Mob Programming" -- Woody Zuill & Kevin Meadows
- "Clean Craftsmanship" -- Robert C. Martin (Chapter 4: Collaborative Programming)
- "The Clean Coder" -- Robert C. Martin (Chapter 13: Teams and Projects)
- butunclebob.com -- blog posts on pairing and team dynamics
- Llewellyn Falco -- Strong-Style Pairing (strongstylepairing.com)
- "Software Craftsmanship" -- Sandro Mancuso (pairing as mentoring)
