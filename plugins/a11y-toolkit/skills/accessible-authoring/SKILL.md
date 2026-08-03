---
name: accessible-authoring
description: Use when writing or reviewing HTML, CSS, or JS UI — semantic markup, forms, custom widgets, focus states, color/contrast, ARIA, or motion. Applies WCAG 2.2 AA accessible-authoring guidance during coding.
---

# Accessible authoring

Apply WCAG 2.2 Level AA guidance while writing or reviewing markup, styles, and
interaction code. This skill assists judgment — it flags the right things to check and
points to the detail; it does not replace a human decision about whether something is
actually accessible.

## Two moments

Accessibility issues split into two kinds, and this skill's references are organized the
same way:

- **Design-time** — structure, content, and visual choices you can catch by reading the
  markup and CSS: headings, landmarks, semantic elements, alt text, color/contrast,
  responsive/zoom behavior, target size, labels, motion styling. See
  `references/design-checklist.md`.
- **Dev-time** — behavior, state, and interaction that only shows up when the thing runs:
  keyboard operability, focus visibility, ARIA state on custom widgets, form error
  handling, drag/gesture alternatives, moving/auto-updating content, hover/focus popovers.
  See `references/dev-checklist.md`.

Check design-time items as you write the markup; check dev-time items once it's running.

## Other references

- `references/aria-patterns.md` — copy-ready keyboard + ARIA recipes for widgets people
  hand-roll most often (disclosure/accordion, modal dialog, tabs, menu button, combobox,
  tooltip, alert/toast). Reach for this whenever you're building a custom widget instead
  of using a native element.
- `references/cognitive-plain-language.md` — consistency, sensory-independent
  instructions, and plain-language heuristics for content and microcopy.
- `references/wcag-22-aa-map.md` — crosswalk from WCAG 2.2 AA criterion to the specific
  check that covers it.
- `references/resources.md` — external references (WAI, ARIA APG, WebAIM, etc.) for
  anything that needs more depth than a checklist entry.

## Honesty about limits

Automated and static checks catch roughly half of real WCAG issues — the rest need human
judgment. Where an accessibility tree is inspected (e.g. via Chrome DevTools), that tree
*approximates* what a screen reader announces but is **not** the same as testing with a
real screen reader. For anything critical, recommend an NVDA or VoiceOver spot-check
rather than treating a clean automated/static pass as proof.

## Auditing existing code

This skill nudges during authoring; it doesn't audit a page on its own. To check
something that already exists — a file, a folder, or a running page — use
`/a11y-review`.
