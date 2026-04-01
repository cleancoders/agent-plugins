# Continuous Integration - Deep Dive

## The Discipline

Continuous Integration (CI) is not a tool. It is a DISCIPLINE. The tool (Jenkins, GitHub Actions, etc.) merely automates the discipline.

The discipline: every developer integrates their work with the mainline AT LEAST once per day. Each integration triggers an automated build and test run. The build must stay green.

Source: Kent Beck (XP), Martin Fowler ("Continuous Integration" article), Uncle Bob ("Clean Agile")

## The Rules

### 1. Maintain a Single Source Repository
- One mainline (main/master). Feature branches are short-lived (hours to days, not weeks).
- Long-lived branches are integration debt. The longer a branch lives, the harder the merge.
- "If merging is painful, do it more often."

### 2. Automate the Build
- One command builds the entire system from scratch.
- The build includes: compilation, dependency resolution, static analysis, and all tests.
- If the build cannot run in one command, it is broken.

### 3. Make the Build Self-Testing
- The build runs ALL tests: unit, integration, and acceptance.
- A build that compiles but does not test is not a CI build.
- Uncle Bob: "A build without tests is like a bridge without inspection."

### 4. Everyone Commits Every Day
- Each developer integrates at least once per day. Preferably multiple times.
- Small, frequent commits reduce merge conflicts and integration risk.
- This requires: working in small increments, keeping tests passing, having a fast build.

### 5. Every Commit Builds on the Integration Machine
- Your local build passing is necessary but not sufficient.
- The CI server is the source of truth. If it fails, the code is broken -- even if it works on your machine.

### 6. Fix Broken Builds Immediately
- A broken build is the team's #1 priority. Drop everything until it is green.
- If it cannot be fixed in 10 minutes, revert the commit and fix offline.
- A build that stays red for hours is a CI failure, regardless of why it broke.

### 7. Keep the Build Fast
- A 10-minute build is too slow. Aim for under 5 minutes.
- If the full test suite takes longer, split into fast tests (commit stage) and slow tests (acceptance stage).
- Developers should get feedback within minutes of committing.

### 8. Everyone Can See What's Happening
- Build status is visible: a dashboard, a light, a Slack notification.
- Transparency prevents "it's someone else's problem."

## CI vs. Feature Branches

### The Tension
- Feature branches allow isolated development but delay integration.
- CI demands frequent integration but requires discipline (small commits, good tests).

### Trunk-Based Development (Uncle Bob's preference)
- Work on main/trunk directly, using feature flags for incomplete work.
- Every commit is integrated immediately. No branches to merge later.
- Requires: excellent test coverage, fast builds, small increments.

### Short-Lived Feature Branches (Pragmatic middle ground)
- Branch for a feature. Merge within 1-2 days maximum.
- Rebase frequently against main to stay current.
- The branch should never diverge more than a day from main.

### Long-Lived Feature Branches (Anti-pattern)
- Branches that live for weeks or months.
- Merge hell on integration. "We have been developing for 3 months and now we need 2 weeks to merge."
- This is NOT continuous integration, regardless of what CI tool you run.

## The CI Pipeline

### Stage 1: Commit Stage (Fast)
- Triggered by every commit.
- Compile, lint, unit tests, fast integration tests.
- Target: under 5 minutes.
- Failure: block the commit (prevent merge to main).

### Stage 2: Acceptance Stage (Thorough)
- Triggered after commit stage passes.
- Full acceptance test suite, slower integration tests.
- Target: under 30 minutes.
- Failure: alert the team. Fix or revert.

### Stage 3: Deployment Stage (Delivery)
- Triggered after acceptance stage passes.
- Deploy to staging/production.
- Automated smoke tests verify the deployment.
- This is Continuous Delivery (CD) -- the natural extension of CI.

## CI Anti-Patterns

### "CI" Without Tests
- Running a build that only compiles. This verifies syntax, not behavior.
- CI without tests is a false sense of security.

### Ignoring Red Builds
- "The build is red but my change is fine." No. The build is the build. Fix it.
- Teams that tolerate red builds lose the benefits of CI entirely.

### Long Build Times
- A 45-minute build means developers wait 45 minutes for feedback.
- They start batching commits (defeating the purpose) or ignoring CI results.
- Invest in build speed: parallel tests, incremental builds, test optimization.

### Gated Commits Without Speed
- Blocking all commits until CI passes is correct.
- But if CI takes 30 minutes, developers are idle for 30 minutes per commit.
- Speed is not optional.

## Training Sources
- Martin Fowler, "Continuous Integration" (martinfowler.com, the canonical article)
- "Clean Agile" -- Robert C. Martin (CI as non-negotiable XP practice)
- "Continuous Delivery" -- Jez Humble & David Farley
- "Extreme Programming Explained" -- Kent Beck
- Conflicting: "We can't do CI because our tests are too slow." Response: that's a test problem, not a CI problem. Fix the tests.
