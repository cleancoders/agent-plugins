# Scaling Patterns and Principles

## Vertical vs. Horizontal Scaling

### Vertical Scaling (Scale Up)
- Add more resources to a single machine: CPU, RAM, disk.
- Simpler architecture. No distributed systems concerns.
- Hard limit: you cannot buy a machine with 10,000 CPUs.
- Use this first. It is simpler and often sufficient.

### Horizontal Scaling (Scale Out)
- Add more machines.
- Requires: load balancing, stateless services, distributed data management.
- Theoretically unlimited scaling.
- Significantly more complex. Do not do this until vertical scaling fails.

Uncle Bob's perspective (Clean Architecture): "Defer scaling decisions as long as possible. The architecture should allow either path."

## Stateless Services

The prerequisite for horizontal scaling.

### What It Means
- A service instance holds no state between requests.
- All state is in an external store (database, cache, message queue).
- Any instance can handle any request. No session affinity needed.

### Why It Matters
- If instances are stateless, you can add/remove instances freely.
- A crashed instance is replaced instantly. No data lost.
- Load balancers can distribute requests randomly.

### Where State Goes
- **Session state**: Shared cache (Redis, Memcached) or JWT tokens (client-side).
- **Application state**: Database or distributed cache.
- **File uploads**: Object storage (S3-pattern), not local filesystem.

## Load Balancing

### Strategies
- **Round-robin**: Distribute requests evenly across instances.
- **Least connections**: Send to the instance with fewest active connections.
- **Weighted**: Direct more traffic to more powerful instances.
- **Hash-based**: Route based on a key (user ID, session) for consistency.

### Health Checks
- Load balancer periodically checks instance health.
- Unhealthy instances are removed from the pool.
- This is how zero-downtime deployment works: deploy a new instance, verify health, add to pool, remove old instance.

## Database Scaling

### Read Replicas
- One primary (writes) + multiple replicas (reads).
- Read-heavy workloads scale by adding replicas.
- Eventual consistency: replicas may lag behind the primary.

### Sharding (Partitioning)
- Split data across multiple databases by a shard key.
- Each shard holds a subset of the data.
- Queries that span shards are expensive. Choose the shard key carefully.
- Uncle Bob: this is a detail that the domain should not know about. The repository interface hides sharding.

### Connection Pooling
- Database connections are expensive to create.
- Pool connections: reuse them across requests.
- Size the pool: too small = contention, too large = resource waste.

## Caching at Scale

### Multi-Level Caching
```
Client Cache (browser) -> CDN -> Application Cache -> Database Cache -> Database
```

Each level reduces load on the next. Most requests should be served by an upper level.

### Cache Stampede
- When a popular cache entry expires, many requests hit the database simultaneously.
- Fix: probabilistic early refresh, lock-based refresh, or cache warming.

## Asynchronous Processing

### Message Queues
- Decouple producers from consumers.
- The producer sends a message; the consumer processes it later.
- Benefits: absorb load spikes, retry failed operations, scale consumers independently.

### Event-Driven Architecture
- Components communicate through events, not direct calls.
- Loose coupling: producers do not know who consumes their events.
- Enables independent scaling of each component.

## Clean Architecture and Scaling

Uncle Bob's Clean Architecture SUPPORTS scaling because:

1. **Domain independence**: The domain does not know about infrastructure. You can change the infrastructure (add caching, add replicas) without changing domain code.
2. **Boundary isolation**: Each boundary can be deployed independently. This is the foundation of microservices (if you choose to go that route).
3. **DIP**: Dependencies on abstractions mean you can swap a single-database repository for a sharded one without changing the use case.

"Good architecture defers decisions." -- Including the decision of how to scale.

## Training Sources
- "Clean Architecture" -- Robert C. Martin (architecture that enables scaling)
- "Designing Data-Intensive Applications" -- Martin Kleppmann (the definitive scaling reference)
- "Release It!" -- Michael Nygard (stability patterns at scale)
- Martin Fowler -- articles on microservices, event sourcing, CQRS
- Conflicting: "You must design for scale from day one." Uncle Bob disagrees: design for clean separation of concerns. Scale decisions come later, when you have data about actual load.
