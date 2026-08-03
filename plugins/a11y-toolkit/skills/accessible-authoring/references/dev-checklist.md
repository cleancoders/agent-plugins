# Dev-time accessibility checklist

Checks caught by running it — live browser required. Target: WCAG 2.2 AA, framework-agnostic HTML/CSS/JS.

## Keyboard operability
- [ ] Everything interactive reachable and operable by keyboard alone. (2.1.1)
- [ ] No keyboard traps. (2.1.2)
- [ ] Tab order follows visual/reading order; no positive `tabindex`. (2.4.3)

## Focus visibility

A focus style that exists in CSS is not the same as a focus ring the user can see. Check
the rendered result, not the declaration.

- [ ] Focus indicator **declared** on every focusable element — no bare `outline:none`, and
      no `outline:none` paired with a replacement that a later rule cancels. (2.4.7)
- [ ] Focus indicator **actually renders around the control** — verify visually (screenshot
      with the element focused), not just in computed style. (2.4.7)
- [ ] **Inline-fragment trap:** any `<a>`/`<span>` that wraps block-level children (card
      links, block content inside a link) is still `display:inline` unless told otherwise,
      and `box-shadow` on an inline element paints per *line fragment* — so the ring lands
      on zero-size fragments and behind the children, invisible. Fix with `display:block` on
      the wrapper, or prefer `outline`, which follows the union box. (2.4.7)
- [ ] Focus indicator meets 3:1 against **both** adjacent surfaces it sits between (page
      background *and* the control's own fill, if it has one). (1.4.11)
- [ ] Indicator survives `forced-colors` mode — `box-shadow` is discarded there, `outline`
      is honored, so `outline:0` + `box-shadow` ring means no indicator at all. (1.4.11)
- [ ] Every hover affordance has a `:focus-visible` equivalent — no cue that mouse users get
      and keyboard users don't. (2.4.7)
- [ ] Focused element not hidden behind sticky headers/footers or overlays. (2.4.11)

## Custom widgets & ARIA
- [ ] Correct name, role, value; state updates as it changes (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-current`). (4.1.2)
- [ ] Widgets follow the established keyboard interaction pattern for their type. (4.1.2)
- [ ] Dynamic updates announce via appropriate live regions (`aria-live`, `role="status"`/`role="alert"`). (4.1.3)
- [ ] No redundant/conflicting ARIA. (4.1.2)

## Forms & interaction behavior
- [ ] Errors identified in text (not color alone), tied to their field, with a suggested fix. (3.3.1, 3.3.2, 3.3.3)
- [ ] No surprise context changes on focus or input. (3.2.1, 3.2.2)
- [ ] No redundant re-entry; auth doesn't depend on an inaccessible cognitive test. (3.3.7, 3.3.8)

## Motion & pointer — runtime behavior
- [ ] Drag-operated actions have a single-pointer alternative that works at runtime. (2.5.7)
- [ ] Path-based or multipoint gestures (swipe, pinch) have a simple single-pointer alternative. (2.5.1)
- [ ] Actions fire on the up-event, not the down-event, so a press can be aborted. (2.5.2)
- [ ] Nothing actually flashes more than 3×/second when rendered. (2.3.1)
- [ ] With the OS/browser reduced-motion setting on, the page honors it — the authored `@media (prefers-reduced-motion: reduce)` styles from the design-time check actually take effect. Verify by inspecting those styles and, for critical pages, a real OS/browser toggle (automated tooling can't emulate this media feature). (2.3.1)

## Moving, auto-updating & timed content
- [ ] Anything that moves, scrolls, auto-advances, or auto-updates (carousels, tickers) can be paused, stopped, or hidden. (2.2.2)
- [ ] Audio that plays automatically for more than 3s has a way to pause/stop it or control volume independently. (1.4.2)

## Content on hover or focus
- [ ] Tooltips/popovers triggered by hover or focus are dismissable (Esc), hoverable (pointer can move onto them), and persistent (don't vanish until dismissed or the trigger is left). (1.4.13)

## SPA focus management
- [ ] On route change, focus moves and the page `<title>` updates.

## Windows High Contrast / forced-colors
- [ ] Content that relies on background images or removed borders does not vanish under `forced-colors` mode.

## prefers-reduced-motion runtime
- [ ] `prefers-reduced-motion` is treated as first-class, not a footnote — verified by inspecting the authored `@media (prefers-reduced-motion: reduce)` styles and confirmed with a real OS/browser reduced-motion toggle (automated tooling can't emulate this media feature).
