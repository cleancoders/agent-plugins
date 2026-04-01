# Performance Optimization Principles

## The Rules of Optimization

### Rule 1: Don't Optimize (Yet)
"Premature optimization is the root of all evil." -- Donald Knuth (often quoted by Uncle Bob)

- Write clean, correct code FIRST.
- Make it work. Make it right. THEN make it fast (only if needed).
- "Making it fast" before "making it right" produces fast, broken, unmaintainable code.

### Rule 2: Don't Optimize Yet (For Experts)
Even experienced developers should resist the urge to optimize before measurement.
- Your intuition about what is slow is usually wrong.
- The bottleneck is rarely where you think it is.
- Measure first. Always.

### Rule 3: Measure Before and After
- Profile the system under realistic load.
- Identify the actual bottleneck (not the suspected one).
- Optimize ONLY the bottleneck.
- Measure again to verify improvement.
- If no measurable improvement, REVERT the optimization.

Source: Michael Jackson (the programmer, not the singer): "The First Rule of Program Optimization: Don't do it. The Second Rule of Program Optimization (for experts only): Don't do it yet."

## Types of Optimization

### Algorithmic Optimization
- The most impactful optimization is choosing the right algorithm.
- O(n^2) to O(n log n) is a bigger win than any micro-optimization.
- Know your data structures: hash maps for lookup, trees for ordered data, arrays for sequential access.
- Uncle Bob: "Get the algorithm right first. Then the constants take care of themselves."

### Architectural Optimization
- Caching: avoid redundant computation and I/O.
- Async processing: do not block the user for work that can happen later.
- Connection pooling: reuse expensive resources.
- Database indexing: the single most common performance fix for web applications.

### Micro-Optimization
- Loop unrolling, bit manipulation, avoiding allocations.
- Rarely worth it. Modern compilers and runtimes handle most of this.
- Only justified when profiling shows the inner loop IS the bottleneck.

## Profiling

### Types of Profilers
- **CPU profilers**: Where is time spent? Which functions are hot?
- **Memory profilers**: Where is memory allocated? What is leaking?
- **I/O profilers**: Where is I/O happening? What is blocking on disk/network?
- **Concurrency profilers**: Where are threads blocked? Deadlocks? Contention?

### Profiling Process
1. Define the performance goal (response time, throughput, memory usage).
2. Set up a realistic benchmark (representative data, realistic load).
3. Profile under the benchmark.
4. Identify the top bottleneck (usually one function/query dominates).
5. Optimize that one bottleneck.
6. Measure again. Did it help? If not, revert.
7. Repeat until the goal is met.

### The 80/20 Rule
- 80% of execution time is spent in 20% of the code.
- Profile to find the 20%. Optimize that. Ignore the rest.
- Optimizing code that is not in the hot path is waste.

## Caching

### When to Cache
- Data that is expensive to compute and requested frequently.
- Data that changes infrequently.
- Results of I/O operations (database queries, API calls, file reads).

### Cache Invalidation
"There are only two hard things in Computer Science: cache invalidation and naming things." -- Phil Karlton

- **Time-based expiry (TTL)**: Simple but imprecise. Data may be stale.
- **Event-based invalidation**: Invalidate when the source data changes. Precise but complex.
- **Write-through**: Write to cache and store simultaneously. Cache is always current.
- **Cache-aside**: Application checks cache, falls back to store, populates cache on miss.

### Cache Layers
- **In-process**: Fastest. Limited to one instance. Lost on restart.
- **Distributed**: Shared across instances. Slower than in-process. Survives restarts.
- **CDN/Edge**: For static assets and API responses. Closest to the user.

## Performance and Clean Code

Uncle Bob's position: clean code and performance are NOT opposed.

- Clean code is EASIER to optimize because you can understand it.
- Clean architecture is EASIER to optimize because concerns are separated (you know where the database calls are).
- Premature optimization HARMS clean code by adding complexity before it is justified.
- The discipline: write clean, profile, optimize the bottleneck, keep it clean.

"The only way to go fast is to go well." -- Robert C. Martin

## Training Sources
- "Clean Code" -- Robert C. Martin (avoid premature optimization)
- "Clean Architecture" -- Robert C. Martin (architectural patterns that enable performance)
- "Designing Data-Intensive Applications" -- Martin Kleppmann (system-level performance)
- Michael Jackson -- "Rules of Optimization"
- Donald Knuth -- "Premature optimization is the root of all evil" (from "Structured Programming with go to Statements")
- Conflicting: "Sometimes you need to sacrifice clean code for performance." Uncle Bob: this is the LAST resort, not the first. And when you do, isolate the dirty code behind a clean interface.
