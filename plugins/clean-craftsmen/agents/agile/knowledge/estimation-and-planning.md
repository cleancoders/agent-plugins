# Estimation and Planning

## Why Estimation Matters

From "The Clean Coder" Chapter 10:

Estimation is about COMMUNICATION, not prediction. Business needs to plan. Development needs to be honest. The negotiation between them is where good planning happens.

## The Three Kinds of Estimates

### Commitments
- A commitment is a promise: "I WILL have this done by Friday."
- Only make commitments you are certain you can keep.
- If you cannot commit, do not. Say "I will try" is NOT a commitment -- it is a hedge.

### Estimates
- An estimate is a probability distribution, not a number.
- "This will take 3 days" is wrong. "This will take 1-5 days, most likely 3" is honest.
- Business often treats estimates as commitments. Professionals push back on this.

### Targets
- A target is a business desire: "We need this by March."
- Targets are not estimates. An estimate informs whether a target is achievable.

## PERT Estimation

Program Evaluation and Review Technique (from "The Clean Coder"):

- **Optimistic (O)**: Best case if everything goes perfectly. ~1% chance.
- **Nominal (N)**: Most likely duration. The mode.
- **Pessimistic (P)**: Worst case if everything goes wrong. ~1% chance.

Expected duration: `(O + 4N + P) / 6`
Standard deviation: `(P - O) / 6`

Example: O=1 day, N=3 days, P=12 days
- Expected = (1 + 12 + 12) / 6 = 4.2 days
- SD = (12 - 1) / 6 = 1.8 days
- 95% confidence: 4.2 + 2(1.8) = 7.8 days

Uncle Bob: "If your optimistic and pessimistic estimates are the same number, you are lying."

## Story Points and Velocity

### What They Are
- Story points measure RELATIVE complexity, not time.
- A 2-point story is roughly twice as complex as a 1-point story.
- Velocity is the team's average throughput in story points per iteration.

### How They Go Wrong
- When management treats velocity as a productivity metric: "Why was velocity 30 last sprint and only 25 this sprint?"
- When teams inflate story points to look more productive.
- When story points are compared across teams.

Uncle Bob in "Clean Agile": "Velocity is a planning tool. The moment you use it for performance measurement, it becomes useless for planning because teams will game it."

### Planning with Velocity
- Track velocity over 3-5 iterations to get a stable average.
- Use yesterday's weather: assume next iteration's velocity = average of last 3.
- Plan stories into iterations until velocity is consumed.
- This is not a commitment. It is a forecast based on evidence.

## Iteration Planning

### The Iteration (Sprint)
- 1-2 weeks. Never more than 4 weeks (and 4 is too long for most teams).
- At the start: select stories from the backlog up to velocity.
- During: daily standup to coordinate and surface blockers.
- At the end: demo working software. Retrospect on process.

### Story Decomposition
- If a story cannot be completed in one iteration, it is too big. Split it.
- Split by behavior/scenario, not by layer (not "do the database part then the UI part").
- Each split story should deliver end-to-end value, even if minimal.

### Buffer and Risk
- Do not plan to 100% capacity. Plan to 70-80%.
- The remaining capacity absorbs surprises, bugs, and support work.
- If you routinely finish early, increase capacity next iteration. The system self-corrects.

## When Estimates Are Wrong

They always are. The question is: how do you handle it?

1. **Surface early**: As soon as you know an estimate is off, communicate. "This 3-point story is actually an 8. Here is why."
2. **Re-plan**: Adjust the iteration scope. Do not add overtime.
3. **Learn**: In the retrospective, discuss why the estimate was off. Improve estimation skill.
4. **Do not punish**: If estimates are punished, people will pad them. Padded estimates are useless.

## Training Sources
- "The Clean Coder" Chapter 10 (Estimation) -- Robert C. Martin
- "Clean Agile" Chapters 3-4 (Planning) -- Robert C. Martin
- "Agile Estimating and Planning" -- Mike Cohn
- Micah Martin on estimation at 8th Light
- Conflicting: #NoEstimates movement (Woody Zuill, Neil Killick) argues that estimates are waste and should be eliminated in favor of just doing the highest-priority thing next. Uncle Bob disagrees: business needs forecasts.
