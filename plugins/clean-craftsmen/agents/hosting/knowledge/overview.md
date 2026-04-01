# Hosting Knowledge Overview

## Hosting Spectrum

### Bare Metal / VPS
- Full control, lowest cost at scale
- Highest operational burden
- Best for: predictable workloads, compliance requirements, cost-sensitive at scale

### Managed Services (PaaS)
- Reduced operational burden
- Higher per-unit cost, lower total cost for small teams
- Best for: small-medium apps, teams without dedicated ops

### Serverless
- Zero server management, pay-per-invocation
- Cold start latency, vendor lock-in
- Best for: event-driven workloads, variable traffic, prototypes

### Containers (Docker/Kubernetes)
- Consistent environments, good scaling
- Operational complexity (especially K8s)
- Best for: microservices, teams with ops expertise, medium-large scale

## Infrastructure as Code

### Principles
- All infrastructure defined in version-controlled code
- Changes go through code review and CI pipeline
- Environments are reproducible from code
- No manual changes ("ClickOps") in production

### Patterns
- **Immutable infrastructure**: Replace, do not modify. Build new instances, swap traffic.
- **Idempotent provisioning**: Running the same code twice produces the same result.
- **Secret management**: Secrets in vault/parameter store, never in code.

## Environment Strategy
- Development, staging, and production should be structurally identical
- Use feature flags to control behavior, not separate environments
- Data should be anonymized/synthesized for non-production environments

## Training Sources
- "Infrastructure as Code" by Kief Morris
- "Clean Architecture" by Robert C. Martin (infrastructure is a detail, not the architecture)
- Uncle Bob on keeping infrastructure decisions reversible
- Conflicting view: "Serverless everything" vs. "You will regret not having servers" -- context matters
