# Spiking / Prototyping Discipline

## What a Spike Is

A spike is a time-boxed investigation to reduce uncertainty. It answers a specific question. It produces KNOWLEDGE, not production code.

Term origin: Extreme Programming (Kent Beck). Named after a railroad spike that fixes track in place -- a spike fixes uncertainty.

## When to Spike

### Good Reasons
- "Can we integrate with this third-party API?"
- "How does this library handle concurrent requests?"
- "What is the performance of approach A vs. approach B?"
- "Is this architectural pattern feasible for our constraints?"
- The team cannot estimate a story because the technology is unknown.

### Bad Reasons
- "I want to explore this cool technology." (That is hobby time, not spike time.)
- "I do not feel like writing tests yet." (Spike is not an excuse to skip TDD.)
- "We need to build a prototype to show the client." (A demo is a different activity.)

## Spike Protocol

### 1. Define the Question
- One specific question. "Can we...?" or "How does...?" or "What is the performance of...?"
- If you cannot state the question clearly, you are not ready to spike.

### 2. Time-Box
- Set a hard limit: 1 hour, 4 hours, 1 day, 2 days. Never more than 2 days.
- When the time expires, STOP. Report what you learned.
- If the answer is "we need more time," that IS the answer. The team decides whether to allocate more time.

### 3. Write Throwaway Code
- Spike code is INTENTIONALLY disposable.
- No tests. No clean code. No SOLID compliance. Speed of learning is the only metric.
- This is the ONLY context where Uncle Bob's principles are relaxed -- because the code will be thrown away.
- If you find yourself wanting to keep spike code, that is a warning sign.

### 4. Report Findings
- What was the question?
- What did you learn?
- What is the recommendation?
- What are the risks?
- How does this affect the estimate for the related story?

### 5. Throw Away the Code
- Delete the spike branch. All of it.
- When the real implementation begins, start from scratch with TDD.
- Spike code in production is technical debt born from impatience.

## The Discipline of Throwing Away

Uncle Bob and the craftsmanship community are clear: the purpose of a spike is to learn, not to produce.

"The spike code was never meant to be production code. It was meant to answer a question. The question has been answered. The code has served its purpose." -- Paraphrased from Clean Craftsmanship principles.

### Why Developers Keep Spike Code
- "It works, why rewrite it?" Because it was written without tests and without design.
- "We don't have time to rewrite it." You do not have time to maintain untested code either.
- "The spike was basically production-quality." If it was, you spent too long on it. Spikes should be rough.

### The Compromise (Pragmatic Middle)
- Use the spike to inform the design and test strategy.
- Reference the spike code as you write the production version with TDD.
- The spike accelerates the TDD cycle because you already know the answer.
- But the production code is written cleanly, tested, and reviewed.

## Prototypes vs. Spikes

### Spike (Internal)
- Audience: the development team.
- Purpose: answer a technical question.
- Output: knowledge (documented findings).
- Code: discarded.

### Prototype (External)
- Audience: stakeholders or users.
- Purpose: validate a concept or gather feedback.
- Output: a visible artifact (UI mockup, demo, proof-of-concept).
- Code: discarded (but the temptation to keep it is stronger).

### Danger of Prototypes
- Stakeholders see a working prototype and say "Ship it!"
- The prototype has no tests, no error handling, no security, no clean design.
- "Shipping" it means building on a rotten foundation.
- Professional response: "The prototype proved the concept. Now we build it properly."

## Training Sources
- "Extreme Programming Explained" -- Kent Beck (spike origin)
- "Clean Agile" -- Robert C. Martin (spikes in iteration planning)
- "The Clean Coder" -- Robert C. Martin (estimation under uncertainty)
- 8th Light practices (Micah Martin, Justin Martin) on time-boxed investigation
- Conflicting: "Spikes are waste if you end up building the thing anyway." Response: the spike reduces RISK. Building without understanding is a bigger waste.
