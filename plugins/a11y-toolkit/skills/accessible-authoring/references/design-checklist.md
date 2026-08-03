# Design-time accessibility checklist

Checks caught by reading markup and CSS alone (no browser run required). Target: WCAG 2.2 AA, framework-agnostic HTML/CSS/JS.

## Structure & semantics
- [ ] Exactly one `<h1>`; heading levels don't skip (no `h2 → h4`). (1.3.1, 2.4.6)
- [ ] Landmarks present and correct: one `<main>`, plus `<nav>/<header>/<footer>`; no content stranded outside a landmark. (1.3.1)
- [ ] Semantic elements over `<div>/<span>` soup: `<button>` for actions, `<a href>` for navigation, `<ul>/<ol>` for lists, `<table>` + `<th scope>` for tabular data. (1.3.1, 4.1.1)
- [ ] `<figure>/<figcaption>`, `<fieldset>/<legend>` used where content calls for it. (1.3.1)
- [ ] A skip link ("skip to main content") is present so keyboard users can bypass repeated nav blocks. (2.4.1)

## Text alternatives
- [ ] Meaningful `<img>` has descriptive `alt`; decorative images have `alt=""` (not missing). (1.1.1)
- [ ] Icon-only buttons/links have an accessible name. (1.1.1)
- [ ] Meaningful `<svg>` has `role="img"` + title/label; decorative SVG is `aria-hidden`. (1.1.1)
- [ ] Real text used instead of images of text, except logos — text baked into an image doesn't scale, translate, or recolor. (1.4.5)

## Color & contrast
- [ ] Body text ≥ 4.5:1; large text (≥24px, or ≥18.66px bold) ≥ 3:1. (1.4.3)
- [ ] UI component boundaries and focus indicators ≥ 3:1. (1.4.11)
- [ ] Meaning never carried by color alone. (1.4.1)

## Responsive, zoom & spacing
- [ ] Reflows to 320px wide, no horizontal scroll, no clipped content. (1.4.10)
- [ ] Nothing breaks at 200% zoom. (1.4.4)
- [ ] Survives increased text spacing (line-height 1.5, etc.) — no fixed-height text boxes. (1.4.12)

## Target size
- [ ] Interactive targets ≥ 24×24px, or ≥ 24px spacing between them. (2.5.8 — new in 2.2)

## Links, labels & content
- [ ] Link/button text meaningful out of context (no bare "click here"). (2.4.4)
- [ ] Descriptive, unique page `<title>` per page. (2.4.2)
- [ ] Visible label text is contained in the control's accessible name so voice-control users can target it — e.g. an `aria-label` doesn't contradict the visible text. (2.5.3)
- [ ] `<html lang>` set. (3.1.1)
- [ ] Every form control has a programmatically associated label. (3.3.2)
- [ ] Personal-data inputs use the right `autocomplete` token. (1.3.5)

## Motion styling (authoring)
- [ ] A `@media (prefers-reduced-motion: reduce)` block is present wherever non-essential animation/transition is defined, reducing or removing it. (2.3.1)
- [ ] Meaning is never conveyed by motion alone. (2.3.1)
- [ ] No CSS that produces flashing faster than 3×/second. (2.3.1)
