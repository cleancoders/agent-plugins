# EXPECTED-FINDINGS.md

Answer key for `broken-page.html`, validated against `clean-page.html` (same
page shape, no intentional failures). Run `/a11y-review samples/broken-page.html`
to score the auditor against it: every row below should be caught, with severity
matching within ±1 level.

Severity scale: **Blocker** (task cannot be completed by AT/keyboard users) >
**Serious** (major barrier, workaround unlikely) > **Moderate** (real barrier,
workaround possible) > **Minor** (friction, not a hard blocker).

| # | Description | Location in broken-page.html | WCAG Criterion | Severity |
|---|---|---|---|---|
| 1 | `<html>` has no `lang` attribute, so screen readers can't select the correct pronunciation/voice | `<html>` opening tag | 3.1.1 Language of Page (A) | Serious |
| 2 | "Reserve seat" call-to-action is a `<div onclick>` with no `tabindex`, `role`, or keydown handler — unreachable and inoperable by keyboard | `<div class="cta" onclick="submitForm()">Reserve seat</div>` in the sign-up form | 2.1.1 Keyboard (A) | Blocker |
| 3 | Meaningful `<img>` (kiln/pottery photo) has no `alt` attribute at all, not even `alt=""` | `<img src="kiln.jpg" width="320" height="200">` in the "Upcoming sessions" section | 1.1.1 Non-text Content (A) | Serious |
| 4 | Email `<input>` has no programmatically associated label — only a placeholder, which disappears on input and isn't announced as a label by all AT | `<input id="email" name="email" type="email" placeholder="Email address" required>` in the sign-up form | 3.3.2 Labels or Instructions (A) | Blocker |
| 5 | Body text color `#999999` on white background is ≈2.85:1, failing the 4.5:1 minimum for normal text | `body { color: #999999; }` in the `<style>` block, applies page-wide | 1.4.3 Contrast (Minimum) (AA) | Serious |
| 6 | Global `*:focus { outline: none; }` removes the focus indicator from every focusable element with no visible replacement (no focus ring, box-shadow, or border change) | `<style>` block, `*:focus` rule | 2.4.7 Focus Visible (AA) | Serious |
| 7 | Heading order skips a level: page `<h1>` is followed directly by `<h3>` elements with no intervening `<h2>` | `<h3>Upcoming sessions</h3>` and `<h3>Reserve your spot</h3>`, both after the page `<h1>` | 2.4.6 Headings and Labels (AA); also 1.3.1 Info and Relationships (A) | Moderate |
| 8 | No skip link is present anywhere on the page, so keyboard users must tab through the full header/nav on every page load to reach the main content | Entire `<body>` — compare to `clean-page.html`'s `<a class="skip-link" href="#main">` | 2.4.1 Bypass Blocks (A) | Moderate |
| 9 | Testimonial carousel auto-advances every 3 seconds via `setInterval` indefinitely, with no pause, stop, or hide control | `<div class="carousel" id="carousel">` and its driving `setInterval` in the `<script>` block | 2.2.2 Pause, Stop, Hide (A) | Serious |
| 10 | Icon-only footer button has no accessible name — no `aria-label`, `aria-labelledby`, visible text, or `title`, so AT announces it only as "button" | `<button type="button" class="icon-btn">` in the `<footer>` | 1.1.1 Non-text Content (A); also 4.1.2 Name, Role, Value (A) | Blocker |
| 11 | Card link's focus ring computes correctly but never renders: `.card-link` wraps block-level children while still `display:inline`, so its `box-shadow` paints around zero-size line fragments and behind the card content. The hover affordance (`opacity: 0.5`) also has no `:focus-visible` equivalent | `.card-link:focus` rule in the `<style>` block; `<a class="card-link">` in the "Related reading" section | 2.4.7 Focus Visible (AA); also 1.4.11 Non-text Contrast (AA) | Serious |

**Totals:** 11 planted failures — 3 Blocker, 6 Serious, 2 Moderate, 0 Minor.

**Finding 11 is the regression guard for computed-style-only auditing.** It is invisible to
Lighthouse, to axe, and to any check that reads `getComputedStyle().boxShadow` and stops
there — all of them see a declared focus ring and pass it. Catching it requires either a
`take_screenshot` with the link focused, or a `getClientRects()` fragment check showing
zero-size fragments. An audit run that reports finding 11 as *passing* — or downgrades it to
a contrast note — has the same blind spot this fixture exists to detect.

`clean-page.html` mirrors the same page shape (header/nav/main/footer, image,
two-field form, icon button) with none of the above defects: it has
`<html lang="en">`, a proper `<h1>`→`<h2>` sequence, a working skip link to
`#main`, a `<button>` for the reserve action, `alt` text on the image, labels
on both inputs, `#1a1a1a`-on-white body text (≈17.9:1), a visible
`:focus-visible` outline, no auto-advancing content, and an `aria-label` on
its icon-only button. It should produce zero Blocker/Serious confirmed
findings.
