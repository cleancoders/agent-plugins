# Front-end Development Knowledge Overview

## Component Architecture

### Principles
- Components should have a single responsibility
- Prefer composition over inheritance in component hierarchies
- Separate presentational components (how things look) from container components (how things work)
- Components should be testable in isolation

### State Management
- Local state for component-specific UI concerns
- Shared state for cross-component data
- Predictable state transitions (unidirectional data flow)
- Derived state should be computed, not stored

### Patterns
- **Container/Presentational**: Separate data-fetching from rendering
- **Render Props / Higher-Order Components**: Share behavior across components
- **Hooks/Composables**: Extract reusable stateful logic
- **Event-Driven**: Components communicate through events, not direct references

## Testing Front-end Code

### Test Pyramid for Front-end
1. **Unit Tests**: Individual functions, utilities, state logic
2. **Component Tests**: Render components in isolation, verify behavior
3. **Integration Tests**: Multiple components working together
4. **E2E Tests**: Full user flows through the actual application

### What to Test
- Component rendering given specific props/state
- User interactions (click, type, navigate)
- State transitions
- Edge cases (empty states, loading states, error states)
- Accessibility (keyboard navigation, screen reader output)

## Accessibility (A11y)
- Semantic HTML first (use the right elements)
- ARIA attributes where HTML semantics are insufficient
- Keyboard navigation for all interactive elements
- Sufficient color contrast (WCAG AA minimum)
- Screen reader compatibility
- Focus management for dynamic content

## Performance
- Minimize bundle size (code splitting, tree shaking)
- Lazy load non-critical resources
- Optimize rendering (avoid unnecessary re-renders)
- Use efficient data structures for large lists
- Measure before optimizing (use profiling tools)

## Training Sources
- Clean Code principles applied to front-end
- Uncle Bob on professional standards (all code deserves craft)
- Micah Martin and Justin Martin on ClojureScript and front-end practices
- Conflicting views: "front-end doesn't need architecture" vs. "front-end IS the architecture"
