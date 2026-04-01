# The Apprenticeship Model

## Software Craftsmanship and Apprenticeship

### The 8th Light Model (Micah Martin)
Micah Martin co-founded 8th Light with Uncle Bob. The company pioneered the software apprenticeship model:

- **Apprentice**: Learning the craft. Pairs with mentors daily. Practices katas. Receives frequent feedback.
- **Journeyman**: Proficient practitioner. Can work independently but seeks growth. Mentors apprentices.
- **Craftsman**: Mastery of the craft. Defines standards. Teaches and leads.

This mirrors traditional trades: a blacksmith apprentice works alongside a master for years before working independently.

### The Clean Coder Chapter 14: Mentoring, Apprenticeship, and Craftsmanship

Uncle Bob argues that our industry has NO formal apprenticeship path:
- Computer science degrees teach theory, not practice.
- New graduates are thrown into production with minimal guidance.
- They learn by trial and error (mostly error).
- The result: a profession where most practitioners have never seen good code.

His proposal: formalize apprenticeship. New developers work alongside experienced craftsmen for 1-2 years before working independently.

## Teaching Techniques

### Katas
- A kata is a small, well-known problem (bowling game, word wrap, prime factors, Roman numerals).
- The practitioner solves it repeatedly, focusing on PROCESS, not result.
- TDD cycle, clean naming, refactoring patterns -- these are the skills being practiced.
- Uncle Bob performs the Bowling Game kata in under 20 minutes. He has done it hundreds of times.

### Code Retreat (Corey Haines)
- A full-day event. The same problem (usually Conway's Game of Life) is solved 5-6 times.
- Each session has different constraints: no conditionals, no returns, silent pairing, etc.
- After each session, DELETE the code. Start fresh.
- The purpose: explore design approaches, practice TDD, pair with different people.

### Pairing as Teaching
- The most effective way to teach is to pair.
- Expert navigates, apprentice drives (strong-style pairing).
- The apprentice practices typing, IDE usage, and basic patterns.
- The expert thinks aloud, explaining decisions as they happen.
- Over time, roles reverse as the apprentice gains skill.

### Code Review as Teaching
- Reviews that explain WHY something is wrong teach more than reviews that just say WHAT is wrong.
- "This violates SRP because this class manages both authentication and profile data. Two actors (security team and UX team) would cause changes here."
- Good review feedback teaches principles. Bad review feedback teaches nothing.

## The Deliberate Practice Framework

From "Clean Craftsmanship" Chapter 8 and Anders Ericsson's research:

### What Deliberate Practice Is
- Working on tasks BEYOND your current ability.
- Getting immediate feedback.
- Focusing on specific weaknesses.
- Repeating with variation.

### What It Is NOT
- Doing work you are already good at (that is performance, not practice).
- Coding at work (that is production, not practice).
- Reading about coding (that is study, not practice).

### For Software Developers
- Practice katas with constraints: "Solve this without any if statements."
- Practice in unfamiliar languages: "Solve FizzBuzz in Haskell."
- Practice under time pressure: "Complete the Bowling Game in 15 minutes."
- Practice pair programming: "Solve this using only ping-pong TDD."
- Record yourself coding and review it. Where did you hesitate? What could be smoother?

## Mentoring Practices

### The Socratic Method
- Ask questions instead of giving answers.
- "What would happen if this class needed a new responsibility?"
- "Which SOLID principle does this design support?"
- "What would the test look like for this edge case?"
- The apprentice arrives at understanding through their own reasoning.

### Graduated Responsibility
1. **Observe**: Watch the mentor code. Ask questions.
2. **Assist**: Drive while the mentor navigates (strong-style).
3. **Collaborate**: Ping-pong pairing as equals.
4. **Lead**: The apprentice navigates, the mentor drives.
5. **Solo**: The apprentice works independently with review.

### Feedback
- Frequent: after every pairing session, after every code review.
- Specific: "Your naming has improved -- `calculateTotalDiscount` is clear and intention-revealing."
- Constructive: "This function does three things. Can you identify the three responsibilities?"
- Timely: feedback delayed is feedback lost.

## Building a Learning Culture

### Tech Talks / Lunch-and-Learn
- Team members present topics they are learning.
- Not just technology: process, principles, case studies.
- Creates a culture where learning is valued and visible.

### Book Clubs
- Read a chapter per week. Discuss as a group.
- Recommended starting books: Clean Code, The Pragmatic Programmer, TDD by Example.
- The discussion is as valuable as the reading.

### Open Source Contribution
- Contributing to open source exposes developers to different codebases, styles, and communities.
- Review PRs on open source projects: read other people's code and give feedback.
- "The best way to learn is to teach." -- Reviewing others' code teaches you.

## Training Sources
- "The Clean Coder" Chapter 14 -- Robert C. Martin (apprenticeship)
- "Clean Craftsmanship" Chapter 8 -- Robert C. Martin (deliberate practice)
- "Software Craftsmanship" -- Sandro Mancuso (the apprenticeship journey)
- "Apprenticeship Patterns" -- Dave Hoover & Adewale Oshineye
- Micah Martin -- the 8th Light apprenticeship program
- Corey Haines -- Code Retreat format
- Conflicting: "We can't afford to spend time on practice/mentoring -- we have deadlines." Uncle Bob: "You can't afford NOT to. Untrained developers are more expensive than trained ones."
