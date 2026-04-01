# Project Planning and Tracking

## Software Project Management Philosophy

### The Iron Triangle
Every project has three constraints: scope, time, and cost. You can fix two; the third must flex.

- Fix time + cost -> scope must flex (agile approach: deliver the most valuable features first)
- Fix scope + time -> cost must flex (add people, which has limits per Brooks's Law)
- Fix scope + cost -> time must flex (deliver when it is done)

Uncle Bob in "Clean Agile": The agile approach fixes time and cost, and manages scope through iterative delivery. This is the only approach that gives the business real data for decision-making.

### Brooks's Law
"Adding manpower to a late software project makes it later." -- Fred Brooks, "The Mythical Man-Month"

Why: new people need training, communication overhead increases quadratically (n * (n-1) / 2 channels), and work must be re-partitioned. The productivity dip lasts weeks to months.

When it does not apply: adding specialists for a specific bottleneck (DBA for a database problem) can help because the communication overhead is limited.

## Iteration Planning

### Story Selection
1. Product owner prioritizes the backlog by business value.
2. Development team estimates stories (relative sizing: story points).
3. Team selects stories for the iteration up to their velocity.
4. Team commits to completing the selected stories.

### Breaking Down Work
- Stories should be completable in 1-3 days.
- If a story takes more than half an iteration, split it.
- Split by behavior, not by layer. Each split should deliver end-to-end value.
- "As a user, I can log in" is one story. "Backend authentication endpoint" is NOT a story (no user value on its own).

### Velocity
- Measured in story points completed per iteration.
- Tracked over multiple iterations to establish a trend.
- Used for PLANNING (how much can we do next iteration?), NOT for performance measurement.
- If velocity is used as a metric, teams game it. It becomes useless.

## Risk Management

### Identifying Risks
- What could go wrong? (Technology, team, requirements, external dependencies)
- What is the impact if it happens?
- What is the probability?
- What can we do to mitigate it?

### Spike-Driven Risk Reduction
- If a technical risk is high, run a time-boxed spike (1-2 days) to investigate.
- The spike produces KNOWLEDGE, not production code.
- After the spike, the team can estimate the risky work more accurately.
- This is the spiking agent's domain -- but project management decides WHEN to spike.

### Risk Burndown
- Track identified risks and their status over time.
- Early iterations should address the highest risks first.
- If risks persist late in the project, escalate to stakeholders.

## Communication

### Daily Standup
- 15 minutes maximum. Standing up enforces brevity.
- Each person answers: What did I do? What will I do? What is blocking me?
- Blockers are NOTED, not solved. Solve them after standup.
- Not a status report to the manager. It is a COORDINATION meeting for the team.

### Iteration Demo
- At the end of each iteration, demonstrate working software.
- Stakeholders see real progress, not slides.
- Feedback from the demo drives the next iteration's priorities.
- "Working software is the primary measure of progress." -- Agile Manifesto

### Retrospective
- What went well? What did not? What should we change?
- Pick 1-2 actionable improvements for the next iteration.
- If retrospectives produce no changes, they are waste.
- Psychological safety is essential: people must be able to speak honestly.

## Tracking Progress

### Burndown Chart
- X-axis: time (days in iteration). Y-axis: remaining work (story points).
- Ideal line from total points to zero at iteration end.
- Actual line shows real progress. Deviation shows risk.
- If the actual line is above the ideal line, the team is behind. Adjust scope.

### Cumulative Flow Diagram
- Shows the flow of work through stages (to-do, in-progress, done) over time.
- Band width shows WIP (work in progress) per stage.
- Widening bands = bottleneck. Work is accumulating in that stage.

### What NOT to Track
- Lines of code (meaningless; deleting code is often more valuable than writing it).
- Hours worked (incentivizes being present, not being productive).
- Individual velocity (pits team members against each other).
- Number of commits (incentivizes small, meaningless commits).

## Training Sources
- "Clean Agile" -- Robert C. Martin (project management the agile way)
- "The Mythical Man-Month" -- Fred Brooks (foundational project management)
- "Extreme Programming Explained" -- Kent Beck (iteration planning)
- Micah Martin -- client management and project execution at 8th Light
- Conflicting: "Agile doesn't work for large projects." Response: SAFe exists, but Uncle Bob is skeptical. His answer: keep teams small and coordinate through clean interfaces.
