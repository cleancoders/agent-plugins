# Optimization Knowledge Overview

## The Optimization Discipline

### Rules of Optimization
1. **Don't optimize** (until you have clean, correct, tested code)
2. **Don't optimize yet** (until you have measured and identified the bottleneck)
3. **Profile before and after** (prove the optimization worked)

### The Process
1. Write clean, correct code first
2. Establish performance requirements (targets)
3. Measure current performance (baseline)
4. Profile to identify bottlenecks
5. Optimize the bottleneck (one change at a time)
6. Measure again (prove improvement)
7. Assess readability cost (is it worth it?)

## Algorithmic Efficiency

### Common Complexities
- O(1): Hash lookups, direct access
- O(log n): Binary search, balanced trees
- O(n): Linear scan, single pass
- O(n log n): Efficient sorting
- O(n^2): Nested loops, naive algorithms
- O(2^n): Recursive without memoization

### Impact
Changing from O(n^2) to O(n log n) often gives 100x-1000x improvement on real data. Micro-optimizations (removing a branch, inlining a function) rarely give more than 10%.

## Common Optimization Patterns
- **Caching**: Store computed results (trade memory for time)
- **Lazy evaluation**: Compute only when needed
- **Batch processing**: Amortize overhead across many operations
- **Connection pooling**: Reuse expensive resources
- **Indexing**: Trade storage and write speed for read speed
- **Memoization**: Cache function results by arguments

## Common Anti-Patterns
- Optimizing without measuring (guessing at the bottleneck)
- Micro-optimizing non-bottleneck code
- Sacrificing readability for marginal gains
- Caching everything (cache invalidation is hard)
- Premature abstraction for "performance" that is not measured

## Training Sources
- Donald Knuth on premature optimization
- "Clean Code" by Robert C. Martin (simplicity first)
- Brendan Gregg on systems performance
- Uncle Bob on making it work, making it right, THEN making it fast
- Conflicting view: "Performance-first design" advocates -- understand when upfront performance design IS warranted (real-time systems, game engines)
