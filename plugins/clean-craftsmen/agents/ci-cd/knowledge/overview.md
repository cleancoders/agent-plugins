# CI/CD Knowledge Overview

## Continuous Integration

CI is the practice of integrating code changes frequently -- at least daily, ideally multiple times per day -- into a shared mainline. Each integration triggers an automated build and test cycle.

### The CI Discipline
- Commit to trunk/main frequently (at least daily)
- Every commit triggers a full build and test suite
- Fix broken builds immediately -- this is the team's top priority
- Keep the build fast -- under 10 minutes for the commit stage
- Never go home on a broken build

### What CI Is NOT
- CI is not a tool (Jenkins, GitHub Actions, etc. enable CI but are not CI)
- CI is not "having a build server" -- if developers work on long-lived branches for weeks, there is no integration happening
- CI is not running tests occasionally -- it is running them on every single commit

## Continuous Delivery

CD is the capability to release any build to production at any time. This does not mean every commit goes to production -- it means every commit COULD go to production.

### Pipeline Stages
1. **Commit Stage**: Compile, unit tests, static analysis. Fast (under 10 minutes).
2. **Acceptance Stage**: Integration tests, acceptance tests. Validates behavior.
3. **Performance Stage**: Load tests, performance benchmarks. Validates non-functionals.
4. **Production**: Deployment to live environment. Automated and repeatable.

### Deployment Strategies
- **Blue-Green**: Two identical environments. Switch traffic between them.
- **Canary**: Roll out to a small percentage of users first.
- **Rolling**: Gradually replace instances with the new version.
- **Feature Flags**: Deploy code without activating features. Decouple deployment from release.

## Anti-Patterns
- Long-lived feature branches (integration debt)
- Manual deployment steps (human error)
- Slow pipelines (delayed feedback)
- Flaky tests (eroded trust in the build)
- "Works on my machine" (environment inconsistency)
- Deploying on Fridays without confidence (process fear)

## Training Sources
- "Continuous Delivery" by Jez Humble and David Farley
- "Accelerate" by Forsgren, Humble, Kim (DORA metrics)
- Uncle Bob's posts on professionalism and deployment
- Martin Fowler's articles on CI/CD patterns
