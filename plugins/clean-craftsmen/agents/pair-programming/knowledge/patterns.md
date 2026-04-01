# Pair Programming Patterns (Deep Dive)

## Driver/Navigator (The Foundation)

### The Mechanics
- **Driver**: Hands on keyboard. Thinks tactically. "How do I implement this?"
- **Navigator**: Hands off keyboard. Thinks strategically. "What should we implement next? Is this the right direction?"
- The navigator operates at a DIFFERENT LEVEL OF ABSTRACTION than the driver.

### Common Failure: Same-Level Thinking
If both driver and navigator think at the same level, pairing degenerates into "two people typing slowly." The navigator MUST think ahead, check the bigger picture, and challenge design decisions.

### Rotation Cadence
- Every 15-30 minutes, or after each TDD cycle.
- The new driver should NOT need a verbal handoff if the navigator was paying attention.
- If handoff is needed, the pairing was not working well.

Source: Laurie Williams & Robert Kessler, "Pair Programming Illuminated"

## Ping-Pong TDD (The Natural Rhythm)

### The Protocol
1. A writes a failing test.
2. B reads the test. Understands what behavior is required.
3. B writes minimum code to pass. B writes the next failing test.
4. A reads the test. Understands. Passes it. Writes next test.
5. At any green state, either partner can call REFACTOR.

### Why It Works
- **Both partners write tests AND production code.** No one is "the tester."
- **Each test is a challenge.** "Can you make THIS pass?" creates engagement.
- **Natural rotation.** No timer needed. The TDD cycle IS the rotation trigger.
- **Forces communication through code.** The test IS the specification of what the partner should build.

### Advanced Ping-Pong
- Write a TEST that challenges the partner's design assumptions.
- "I bet you can't make this pass without an if statement."
- This is friendly pressure that produces better designs (Transformation Priority Premise applied).

Source: Kent Beck (original), Uncle Bob (refined), practiced at 8th Light as core pairing pattern.

## Strong-Style Pairing

### Origin
Llewellyn Falco coined this: "For an idea to go from your head into the computer, it MUST go through the other person's hands."

### The Rules
1. The navigator has the ideas. The driver has the keyboard.
2. The navigator describes INTENT: "We need a function that..." not "Type `public void`..."
3. The driver implements the intent. They choose the details.
4. If the driver disagrees, they can push back. But if the navigator insists, the driver types it -- they can discuss after seeing the result.

### When to Use
- **Knowledge transfer**: The expert navigates, the learner drives. The learner practices while the expert guides.
- **When one partner dominates**: If one person always drives, strong-style forces the other to drive.
- **Complex design**: The navigator can focus entirely on design while the driver handles implementation.

### The Trust Dimension
Strong-style requires trust. The driver must trust the navigator's direction. The navigator must trust the driver's implementation choices. Without trust, it becomes frustrating.

## Promiscuous Pairing (Rotation Across a Team)

### The Pattern
- Pairs rotate frequently: every 90 minutes, every half-day, or every day.
- No one pairs with the same person for more than one session.
- The code belongs to the team, not to the pair that wrote it.

### Benefits
- Knowledge spreads across the entire team. No silos.
- Different pairs bring different perspectives to the same code.
- Bus factor approaches N (anyone can work on anything).

### Challenges
- Context switching is real. Some tasks benefit from sustained focus.
- New pairs need ramp-up time.
- Some personality combinations pair better than others.

Source: Corey Haines and the Software Craftsmanship community's code retreat format.

## Mob Programming

### Roles
- **Driver** (1): Types. Does NOT decide. Follows navigator's direction.
- **Navigator** (1): Decides direction. Speaks at intent level.
- **Mobbers** (N-2): Think ahead. Raise hands to contribute during pauses.

### Woody Zuill's Rules
1. Treat everyone with kindness, consideration, and respect.
2. The person at the keyboard is the driver. Everyone else is the mob.
3. Rotate frequently (every 5-15 minutes).
4. "Yes, and..." -- build on ideas rather than shutting them down.

### When Mob > Pair
- **Complex, high-stakes code**: More eyes = fewer defects.
- **Team alignment**: Everyone understands the design because everyone was there.
- **Onboarding**: New team members see how the team thinks, not just how they code.
- **Stuck**: When a pair is stuck, adding a third perspective often breaks the logjam.

### When Mob < Pair
- **Simple, mechanical tasks**: Mob is overkill for renaming variables.
- **Individual exploration**: Spikes and experiments often need solo or pair focus first.

## Remote Pairing

### Tools
- Shared editors: VS Code Live Share, JetBrains Code With Me, tmux/screen for terminal.
- Video: Keep camera on. Non-verbal communication matters.
- Audio: Low-latency is critical. Echo and delay kill pairing flow.

### Remote-Specific Challenges
- **Fatigue**: Remote pairing is more tiring than in-person. Take breaks every 45-50 minutes.
- **Distractions**: Both partners must close non-essential tabs, mute notifications.
- **Navigator disengagement**: Easier to disengage when remote. Active communication counters this.
- **Time zones**: Pair during overlapping hours. Async work during non-overlapping hours.

## Anti-Patterns

### "Watch the Master" Pairing
- One person drives all session. The other watches.
- Fix: Mandatory rotation. Use ping-pong to force both partners to code.

### Email While Pairing
- Navigator disengages and does other work.
- Fix: If you cannot give full attention, end the pairing session.

### Dictator Pairing
- Navigator dictates every keystroke: "Type `int`. Now type `count`. Now type `equals`..."
- Fix: Navigate at intent level. Trust the driver.

### Parallel Work in a "Pair"
- Both partners sit together but work on different things.
- This is not pairing. It is co-located solo work. Either pair or do not pair.

## Training Sources
- "Pair Programming Illuminated" -- Williams & Kessler (the definitive book)
- "Extreme Programming Explained" -- Kent Beck (pairing as XP practice)
- "Clean Craftsmanship" -- Robert C. Martin (pairing as professional discipline)
- "The Clean Coder" -- Robert C. Martin (collaboration chapter)
- Llewellyn Falco -- Strong-Style Pairing (llewellynfalco.blogspot.com)
- Woody Zuill -- Mob Programming (mobprogramming.org)
- Corey Haines -- Code Retreat format (coderetreat.org)
- Conflicting: "Pairing is twice the cost for less than twice the output" -- studies show pairing produces 15% less code but with 15% fewer defects. The total cost (including debugging) is usually lower.
