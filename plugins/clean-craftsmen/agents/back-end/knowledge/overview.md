# Back-end Development Knowledge Overview

## Domain-Centric Architecture

### The Dependency Rule
- Dependencies point inward: controllers depend on use cases, use cases depend on domain entities
- The domain knows nothing about the web, database, or external services
- Frameworks are details confined to the outermost layer

### Layers (Clean Architecture)
1. **Entities**: Core business objects and rules
2. **Use Cases**: Application-specific business rules
3. **Interface Adapters**: Controllers, presenters, gateways
4. **Frameworks & Drivers**: Web frameworks, databases, external services

## API Design

### Principles
- APIs are contracts: changes must be backward-compatible or versioned
- Use standard HTTP semantics (status codes, methods, headers)
- Return consistent response structures
- Document with examples, not just schemas
- Rate limit and paginate by default

### Error Responses
- Return structured errors with code, message, and details
- Never expose internal stack traces or system details
- Use appropriate HTTP status codes (4xx for client errors, 5xx for server errors)
- Log full details server-side

## Data Access

### Repository Pattern
- Abstract persistence behind an interface
- Domain objects do not know how they are stored
- Repositories return domain objects, not database rows

### Query Safety
- Always use parameterized queries
- Watch for N+1 query problems
- Use transactions for multi-step operations
- Validate data at the boundary before it reaches the domain

## Concurrency
- Understand the concurrency model of your language/runtime
- Use appropriate synchronization for shared mutable state
- Prefer immutable data where possible
- Design for idempotency in APIs

## Observability
- Structured logging (JSON, not printf)
- Distributed tracing for multi-service systems
- Health check endpoints
- Metrics for latency, throughput, and error rates

## Training Sources
- "Clean Architecture" by Robert C. Martin
- "Domain-Driven Design" by Eric Evans
- Uncle Bob's blog posts on architecture and dependency management
- Micah Martin's practical server-side work at 8th Light
- Conflicting view: "Monolith First" (Fowler) vs. "Start with microservices"
