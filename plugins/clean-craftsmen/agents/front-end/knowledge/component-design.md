# Front-End Component Design Principles

## Clean Code Applied to Front-End

Every principle from Clean Code applies to front-end code. The medium changes (HTML, CSS, JavaScript, frameworks), but the discipline does not.

### Naming in Front-End
- Component names should describe WHAT, not HOW: `UserProfile` not `UserCard` (what if it becomes a full page?)
- Event handler names should describe the action: `onSubmitOrder` not `handleClick`
- CSS class names should describe purpose: `.price-highlight` not `.red-bold`

### Component SRP
- A component should have ONE reason to change.
- `<UserProfile>` that also manages authentication violates SRP.
- Split: `<UserProfile>` (display), `<LoginForm>` (auth), `<AuthGuard>` (route protection).

### Component Size
- Like functions in Clean Code: components should be SMALL.
- If a component file exceeds ~100 lines, it probably does too much.
- Extract sub-components. Compose them.

## Architecture Patterns

### Presentational vs. Container Components (Dan Abramov)
- **Presentational**: How things LOOK. Receive data via props. No business logic.
- **Container**: How things WORK. Manage state, make API calls, pass data down.
- This maps to Clean Architecture: presentational = interface adapters, container = use case orchestration.

### Atomic Design (Brad Frost)
- **Atoms**: Smallest units (button, input, label)
- **Molecules**: Groups of atoms (search bar = input + button)
- **Organisms**: Groups of molecules (header = logo + nav + search)
- **Templates**: Page layouts (header + sidebar + content area)
- **Pages**: Specific instances of templates with real data

### Clean Architecture in Front-End
- **Domain layer**: Business logic, validation rules, entity types. NO framework dependencies.
- **Application layer**: Use cases, state management orchestration.
- **Presentation layer**: Components, views, styling. Framework-specific.
- **Infrastructure layer**: API clients, storage, routing.

Dependencies point INWARD. The domain does not know about React, Vue, or Angular.

## State Management

### Local vs. Global State
- **Local**: Component-specific UI state (is dropdown open, form field value). Keep local.
- **Shared**: State needed by multiple components (current user, cart contents). Lift up or use global store.
- **Server**: Data from the API (user list, product catalog). Manage with data fetching patterns.

### Principles
- Single source of truth: each piece of state lives in ONE place.
- State should be as close to where it is used as possible (locality).
- Derived state should be computed, not stored (DRY).
- State updates should be predictable and traceable.

## Testing Front-End Code

### Component Tests
- Render the component with props. Verify the output.
- Test behavior: click a button, verify the handler was called.
- Do NOT test implementation details (internal state, lifecycle methods).
- Test what the USER sees and does.

### Integration Tests (Component + State)
- Render a connected component with real state management.
- Verify that actions flow from UI to state and back to UI.
- Use a real store (not mocked) for integration tests.

### E2E Tests
- Test critical user journeys through the real application.
- Use sparingly. Most front-end testing should be component-level.

### The Testing Trophy (Kent C. Dodds)
- Static analysis > Unit tests > Integration tests > E2E tests
- More integration tests than unit tests (controversy with the test pyramid).
- This is a front-end-specific adaptation of the test pyramid.

## Accessibility

- Semantic HTML: use `<button>` not `<div onclick>`, use `<nav>` not `<div class="nav">`.
- ARIA attributes when semantic HTML is insufficient.
- Keyboard navigation: every interactive element must be keyboard-accessible.
- Color contrast: WCAG AA minimum (4.5:1 for text).
- Screen reader testing: does the page make sense when read aloud?

Accessibility is not optional. It is a quality requirement, like tests.

## Training Sources
- "Clean Code" -- Robert C. Martin (applied to any language, including JavaScript)
- "Clean Architecture" -- Robert C. Martin (dependency rule applies to front-end)
- Dan Abramov -- "Thinking in React," presentational/container pattern
- Kent C. Dodds -- "Testing Trophy," component testing philosophy
- Brad Frost -- "Atomic Design"
- Conflicting: "Clean Architecture is overkill for front-end." Response: the dependency rule scales down. Even a small front-end benefits from separating domain logic from framework-specific code.
