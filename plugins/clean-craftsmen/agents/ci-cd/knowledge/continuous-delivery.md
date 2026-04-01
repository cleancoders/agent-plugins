# Continuous Delivery and Deployment

## Continuous Delivery (CD)

"Your software is deployable at any time." -- Jez Humble

Continuous Delivery means that every commit that passes the CI pipeline is a RELEASE CANDIDATE. The decision to deploy is a business decision, not a technical one.

### The Deployment Pipeline
```
Commit -> Unit Tests -> Acceptance Tests -> Staging -> [Manual Approval] -> Production
```

Every stage is automated except the final approval. The team can deploy any successful build at any time.

### Feature Flags (Toggle)
- Deploy incomplete features behind flags. The code is in production but not activated.
- Decouples deployment from release: deploy daily, release when the feature is ready.
- Clean up old flags aggressively. Flags left forever become technical debt.

### Blue-Green Deployment
- Two identical production environments: blue (current) and green (new).
- Deploy to green. Test. Switch traffic from blue to green.
- If something breaks, switch back to blue instantly.
- Zero-downtime deployment.

### Canary Deployment
- Deploy to a small percentage of users first.
- Monitor for errors, performance degradation.
- If clean, gradually roll out to all users.
- If problems, roll back the canary.

### Rolling Deployment
- Update instances one at a time.
- At any point, some instances run the old version and some run the new.
- Requires backward-compatible changes (no breaking database migrations).

## Continuous Deployment

Goes further than Continuous Delivery: every commit that passes all automated checks is deployed to production AUTOMATICALLY. No manual approval.

### Requirements for Continuous Deployment
- Comprehensive automated test suite (unit + integration + acceptance + smoke)
- Feature flags for incomplete work
- Automated rollback capability
- Monitoring and alerting
- High team confidence in their tests

### Why Uncle Bob Advocates This
From "Clean Agile": "If you can't deploy at any time, you are accumulating integration risk."

Small, frequent deployments are LESS risky than large, infrequent ones:
- Each deployment changes less, so failures are easier to diagnose.
- Rollback is easier because the delta is small.
- Team gets fast feedback from real users.

## Database Migrations

### The Challenge
Database schema changes are harder to deploy continuously because:
- Schema changes can break running instances.
- Rollback requires reverse migrations.
- Data migrations can be slow and block deployments.

### Strategies
- **Expand-Contract**: Add new column, deploy code that uses both old and new, migrate data, deploy code that uses only new, drop old column.
- **Backward-compatible changes**: Always. Add columns (don't remove). Add tables (don't drop).
- **Versioned migrations**: Track schema version. Apply migrations in order. Never skip.

## The Relationship to TDD and Clean Code

Uncle Bob connects these practices:

1. **TDD** gives you the test suite that makes CI trustworthy.
2. **CI** gives you the fast feedback loop that makes refactoring safe.
3. **Refactoring** keeps the code clean, which keeps the build fast.
4. **CD** gives you the deployment capability that makes small releases possible.
5. **Small releases** give you fast feedback from users, which drives the next TDD cycle.

Without TDD, CI is untrustworthy. Without CI, CD is risky. Without CD, releases are painful. The practices reinforce each other.

## Training Sources
- "Continuous Delivery" -- Jez Humble & David Farley (the definitive book)
- "Clean Agile" -- Robert C. Martin (CD as part of the agile cycle)
- Martin Fowler -- articles on deployment pipelines, feature flags, blue-green deployment
- "Accelerate" -- Nicole Forsgren, Jez Humble, Gene Kim (research showing CD improves outcomes)
- Conflicting: "CD is too risky for regulated industries." Response: CD with proper gates (compliance checks, audit trails, approval workflows) is SAFER than manual deployment processes.
