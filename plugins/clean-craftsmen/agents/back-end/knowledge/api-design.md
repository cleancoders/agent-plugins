# Back-End API Design and Architecture

## Clean Architecture for Back-End

Uncle Bob's Clean Architecture is MOST naturally applied to back-end systems:

### The Layers
```
[Frameworks/Drivers] -> [Interface Adapters] -> [Use Cases] -> [Entities]
   (HTTP, DB)           (Controllers,          (Application    (Domain
                         Repositories)          Services)       Objects)
```

### The Dependency Rule
- Controllers depend on use cases. Use cases depend on entities.
- NEVER the reverse. Entities do not know about HTTP. Use cases do not know about JSON.
- The web framework is a DETAIL, not the architecture.

### Practical Structure (Language-Agnostic)
```
src/
  domain/           # Entities, value objects, domain services
  application/      # Use cases, application services, DTOs
  infrastructure/   # Database, external APIs, file system
  interface/        # HTTP controllers, CLI handlers, event consumers
```

## API Design Principles

### RESTful Principles (When Using REST)
- Resources are nouns: `/orders`, `/users/42`, `/products`
- HTTP methods are verbs: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- Status codes communicate outcome: 200 (OK), 201 (created), 400 (bad request), 404 (not found), 500 (server error)
- HATEOAS: responses include links to related resources (aspirational; few APIs achieve this)

### Request/Response Design
- Request DTOs validate and transform external input into internal representations.
- Response DTOs shape internal data for external consumption.
- NEVER expose domain entities directly in API responses. This couples your API to your domain model.

### Versioning
- URL versioning: `/api/v1/users` (simple, visible)
- Header versioning: `Accept: application/vnd.myapp.v1+json` (cleaner URLs)
- Choose one approach and be consistent.
- Breaking changes = new version. Additive changes (new fields) = same version.

### Error Handling
- Consistent error format across all endpoints.
- Include: error code, human-readable message, details/field-level errors.
- Do NOT expose stack traces or internal details in production.
- Log the full error server-side for debugging.
- Uncle Bob's principle: exceptions over error codes applies to APIs via proper HTTP status codes.

## Database Interaction

### Repository Pattern
- Domain code depends on repository INTERFACES (DIP).
- Infrastructure code implements the repositories.
- This allows: swapping databases, testing with in-memory repositories, clean domain logic.

### Avoiding ORM Pitfalls
- ORMs are useful but dangerous if they leak into the domain.
- Domain entities should NOT be ORM-annotated classes. Separate domain objects from persistence models.
- This is the Clean Architecture boundary: the database is a detail.

### Query Optimization
- N+1 query problem: loading a list of entities, then loading a related entity for each one.
- Fix: eager loading, batch loading, or query-level joins.
- Index the fields you query on. Profile slow queries. Measure, do not guess.

## Middleware and Cross-Cutting Concerns

### Authentication and Authorization
- Auth middleware validates tokens/sessions before the request reaches the controller.
- Authorization checks happen in the use case layer (the use case knows what permissions are needed).
- Separation: authentication = "who are you?", authorization = "can you do this?"

### Logging
- Log at the boundary: requests in, responses out, errors caught.
- Structured logging (JSON) for machine parsing.
- Correlation IDs: tag every log entry in a request with the same ID for tracing.

### Input Validation
- Validate at the boundary (controller/middleware level).
- Reject invalid input BEFORE it reaches the use case.
- Domain validation (business rules) is separate from input validation (format/type checks).

## Testing Back-End Code

### Unit Tests (Domain + Use Cases)
- Test domain logic in isolation. No database, no HTTP, no frameworks.
- Test use cases with mock repositories and services.
- This is where most of your tests live: fast, focused, comprehensive.

### Integration Tests (Infrastructure)
- Test repository implementations against a real database (or in-memory equivalent).
- Test external API clients against stubs or contract tests.
- Slower than unit tests but necessary for infrastructure confidence.

### API Tests
- Send HTTP requests to the running API. Verify responses.
- Test the full request-response cycle: serialization, routing, controller, use case, response.
- Use a test database or in-memory database for isolation.

## Training Sources
- "Clean Architecture" -- Robert C. Martin (the primary source)
- Martin Fowler -- "Patterns of Enterprise Application Architecture"
- "Designing Data-Intensive Applications" -- Martin Kleppmann (data layer)
- butunclebob.com -- "The Clean Architecture" blog post (the original formulation)
- Conflicting: "Clean Architecture adds too many layers for simple APIs." Response: start simple. Add layers as complexity grows. The dependency rule is always valuable, even in small systems.
