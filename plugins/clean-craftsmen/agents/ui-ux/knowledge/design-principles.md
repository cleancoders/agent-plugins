# UI/UX Design Principles for Craftsmen

## The Intersection of Clean Code and UX

Good UX and clean code share a fundamental value: CLARITY. Clean code is clear to the developer. Good UX is clear to the user. Both require empathy -- understanding someone else's mental model.

## Core UX Principles

### 1. Don't Make the User Think (Steve Krug)
- Every interaction should be self-evident.
- If a user has to think about how to do something, the design has failed.
- Labels, buttons, and navigation should communicate their purpose instantly.

### 2. Consistency
- Internal consistency: the same action works the same way throughout the app.
- External consistency: follow platform conventions (users already know how iOS/Android/web works).
- A "Save" button should always save. Not sometimes save, sometimes submit, sometimes apply.

### 3. Feedback
- Every user action should produce visible feedback.
- Click a button -> the button changes state (loading, disabled).
- Submit a form -> show confirmation or error.
- No action should leave the user wondering "Did that work?"

### 4. Forgiveness (Error Recovery)
- Users make mistakes. The system should make recovery easy.
- Undo > "Are you sure?" confirmation dialogs.
- Destructive actions should be reversible when possible.
- Error messages should explain WHAT went wrong and HOW to fix it.

### 5. Progressive Disclosure
- Show only what the user needs at each step.
- Advanced options are available but not in the way.
- Reduce cognitive load: fewer choices = easier decisions.

### 6. Accessibility is Not Optional
- 15% of the world's population has a disability.
- Accessible design is good design for everyone (curb cuts benefit wheelchair users AND parents with strollers).
- WCAG guidelines: perceivable, operable, understandable, robust.
- Semantic HTML, keyboard navigation, screen reader support, color contrast.

## User-Centered Design Process

### 1. Research
- Talk to users. Observe users. Understand their goals, not just their feature requests.
- "If I had asked people what they wanted, they would have said faster horses." (attributed to Henry Ford)
- Users describe problems. Designers find solutions.

### 2. Design
- Wireframes: low-fidelity layouts. Focus on structure, not visual design.
- Prototypes: interactive mockups. Test the flow before building.
- Visual design: the polish layer. Color, typography, spacing, imagery.

### 3. Test
- Usability testing: watch real users try to use the design.
- 5 users find 85% of usability problems (Jakob Nielsen).
- Test early, test often. A prototype test is cheaper than a production fix.

### 4. Iterate
- Design is never done. Gather feedback. Improve.
- "If you are not embarrassed by your first version, you launched too late."
- But: do not ship something unusable. Find the balance between speed and quality.

## Information Architecture

### Navigation Patterns
- **Hub and spoke**: Central page links to sub-pages (dashboards, home screens).
- **Hierarchical**: Tree structure (file systems, documentation sites).
- **Sequential**: Step-by-step (wizards, checkout flows, onboarding).
- **Flat**: All items at the same level (galleries, search results).

### Content Organization
- Group related items together (Gestalt principle of proximity).
- Label clearly. Users scan, they do not read.
- Provide search for large content sets. Users should not browse 500 items.

## Typography and Visual Hierarchy

### Hierarchy
- Size, weight, color, and spacing create hierarchy.
- The most important element should be the most visually prominent.
- Maximum 2-3 levels of hierarchy per screen.

### Readability
- Line length: 50-75 characters per line. Too wide = hard to track to the next line.
- Line height: 1.4-1.6x font size.
- Contrast: WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
- Font choice: readable at all sizes. Avoid decorative fonts for body text.

## Clean Code Principles Applied to UI

### SRP for Components
- A `LoginForm` component should handle login UI. It should not also manage routing or user profiles.
- Separate concerns: data fetching, state management, and presentation in different components or layers.

### DIP for UI Architecture
- UI components should depend on abstractions (interfaces, callbacks), not concretions (specific API clients, specific state libraries).
- A `UserList` component receives data through props, not by calling an API directly.

### Testing UI
- Test behavior, not appearance: "When the user clicks submit, the onSubmit handler is called."
- Component tests: render with props, simulate actions, verify output.
- Visual regression tests: catch unintended visual changes.
- Accessibility tests: automated checks for WCAG compliance.

## Training Sources
- "Don't Make Me Think" -- Steve Krug (the essential UX book)
- "The Design of Everyday Things" -- Don Norman (design psychology)
- "Refactoring UI" -- Adam Wathan & Steve Schoger (practical visual design for developers)
- "Clean Code" -- Robert C. Martin (clarity and naming apply to UI code too)
- Jakob Nielsen -- usability heuristics (nngroup.com)
- Conflicting: "Developers should not design." Response: developers MUST understand UX principles because they make hundreds of micro-design decisions while building. The specialist designer sets the direction; the developer executes with taste.
