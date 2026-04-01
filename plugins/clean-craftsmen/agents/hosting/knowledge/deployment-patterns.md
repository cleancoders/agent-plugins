# Hosting and Deployment Patterns

## Infrastructure as Detail

Uncle Bob's core principle applied to hosting: **the hosting environment is a DETAIL, not the architecture.**

Your application should be deployable to:
- A bare-metal server
- A VM (EC2, GCE, Azure VM)
- A container (Docker, Podman)
- A serverless platform (Lambda, Cloud Functions)
- A PaaS (Heroku, Render, Railway)

If your application is tightly coupled to its hosting environment, you have made a hosting decision into an architectural constraint.

## Containerization

### Principles
- A container packages the application with its runtime dependencies.
- Reproducible: the same container image runs identically everywhere.
- Isolated: containers do not interfere with each other.
- Lightweight: share the host OS kernel (unlike VMs).

### Dockerfile Discipline
- Start from a minimal base image.
- Install only what is needed.
- Multi-stage builds: build in one stage, copy only artifacts to the final stage.
- Do not run as root. Create a non-root user.
- Pin dependency versions. Reproducibility matters.

### Container Anti-Patterns
- **Fat containers**: Installing an entire OS and IDE into a container. Containers are not VMs.
- **Snowflake containers**: Building containers manually. Always use a Dockerfile.
- **Persistent state in containers**: Containers are ephemeral. State goes in volumes or external stores.
- **Running multiple processes**: One process per container. Use orchestration for multi-process.

## Orchestration (Kubernetes and Beyond)

### Core Concepts
- **Pods**: Smallest deployable unit. One or more containers that share networking and storage.
- **Services**: Stable network endpoints for a set of pods. Load balancing built in.
- **Deployments**: Declarative updates for pods. Rolling updates, rollbacks.
- **ConfigMaps/Secrets**: Externalized configuration. Do not bake config into container images.

### When Kubernetes Is Overkill
- Single application, single instance: use a VPS or PaaS.
- Small team, simple deployment: Docker Compose is sufficient.
- Kubernetes adds complexity. Only use it when the problems it solves (multi-service orchestration, auto-scaling, self-healing) are real problems for you.

## Environment Management

### The Twelve-Factor App (Heroku's Principles)
1. One codebase, many deploys.
2. Explicitly declare dependencies.
3. Store config in environment variables.
4. Treat backing services as attached resources.
5. Strictly separate build and run stages.
6. Execute as stateless processes.
7. Export services via port binding.
8. Scale out via the process model.
9. Maximize robustness with fast startup and graceful shutdown.
10. Keep development, staging, and production as similar as possible.
11. Treat logs as event streams.
12. Run admin tasks as one-off processes.

These principles align with Clean Architecture: the application does not know where it is hosted.

### Environment Parity
- Dev, staging, and production should be as similar as possible.
- "It works on my machine" is a symptom of environment divergence.
- Containers help: the same image runs everywhere.
- Infrastructure as Code (Terraform, Pulumi, CloudFormation) ensures environments are reproducible.

## Monitoring and Observability

### The Three Pillars
- **Logs**: What happened. Structured, searchable, retained.
- **Metrics**: How the system is performing. Time-series data (request rate, error rate, latency).
- **Traces**: How a request flows through the system. Distributed tracing for multi-service architectures.

### Alerting
- Alert on symptoms (high error rate, slow response time), not causes (high CPU).
- Avoid alert fatigue: if an alert does not require human action, it should not page someone.
- Runbooks: for every alert, document what to check and how to fix it.

## Security in Hosting

- **TLS everywhere**: All traffic encrypted in transit.
- **Network segmentation**: Databases are not accessible from the public internet.
- **Secret management**: Use a secrets manager (Vault, AWS Secrets Manager). Never store secrets in environment variables in plaintext configuration files.
- **Image scanning**: Scan container images for known vulnerabilities.
- **Immutable infrastructure**: Do not SSH into production and make changes. Redeploy.

## Training Sources
- "The Twelve-Factor App" -- Adam Wiggins (12factor.net)
- "Clean Architecture" -- Robert C. Martin (infrastructure as detail)
- "Site Reliability Engineering" -- Google (monitoring, alerting, incident response)
- "Release It!" -- Michael Nygard (production patterns)
- Conflicting: "Serverless eliminates all hosting concerns." Response: serverless trades infrastructure management for vendor lock-in and cold start latency. It is a valid choice for some workloads, not a universal solution.
