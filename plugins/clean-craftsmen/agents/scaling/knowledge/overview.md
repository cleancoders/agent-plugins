# Scaling Knowledge Overview

## Scaling Fundamentals

### Vertical vs. Horizontal
- **Vertical**: Bigger machine (more CPU, RAM, faster disk). Simple but has a ceiling.
- **Horizontal**: More machines. Complex but nearly unlimited. Requires stateless design.

### The Scaling Sequence
1. Optimize the single node first (algorithmic improvements, caching, query optimization)
2. Scale vertically (bigger machine -- cheapest operational complexity)
3. Read replicas (separate read from write load)
4. Caching layers (reduce database load)
5. Horizontal scaling of compute (stateless services behind a load balancer)
6. Data partitioning/sharding (when single-database capacity is exhausted)

## Key Patterns

### Statelessness
- Store no session state on application servers
- Use external stores (Redis, database) for shared state
- Each request can be handled by any instance

### Caching
- **CDN**: Static assets and cacheable responses at the edge
- **Application cache**: Frequently read, rarely changed data (Redis, Memcached)
- **Database query cache**: Cache expensive queries
- **Cache invalidation**: The hard part. Time-based, event-based, or write-through.

### Data Partitioning
- **Sharding**: Split data across databases by key (user ID, region, etc.)
- **Read replicas**: Separate read load from write load
- **CQRS**: Separate read and write models entirely
- **Event sourcing**: Store events, derive state. Enables flexible scaling of reads.

### Resilience
- **Circuit breakers**: Stop calling failing services
- **Bulkheads**: Isolate failures to prevent cascading
- **Timeouts**: Do not wait forever for a response
- **Retries with backoff**: Handle transient failures, but avoid thundering herd
- **Graceful degradation**: Return stale data rather than fail completely

## Anti-Patterns
- Premature distribution (adding microservices before you need them)
- Shared mutable state (prevents horizontal scaling)
- Synchronous chains (one slow service blocks everything)
- No load testing (surprises in production)
- Scaling the wrong thing (compute when the problem is I/O)

## Training Sources
- "Designing Data-Intensive Applications" by Martin Kleppmann
- "Clean Architecture" by Robert C. Martin (boundaries enable scaling)
- Uncle Bob on keeping architecture simple until complexity is needed
- Conflicting view: "Design for scale from day one" vs. "YAGNI for infrastructure" -- both have merit in different contexts
