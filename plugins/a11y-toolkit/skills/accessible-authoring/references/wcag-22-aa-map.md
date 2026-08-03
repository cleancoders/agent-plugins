# WCAG 2.2 criterion → checklist crosswalk

Every criterion number referenced anywhere in `design-checklist.md`, `dev-checklist.md`, or
`cognitive-plain-language.md`, mapped to its WCAG level and where it's checked. Target: WCAG 2.2 AA.

Note: 3.1.3, 3.1.4, and 3.1.5 are AAA-level criteria. They're tracked here because
`cognitive-plain-language.md` reports against them as FYI heuristics (never a pass/fail gate),
not because AA conformance requires them. 4.1.1 (Parsing) was removed as a distinct success
criterion in WCAG 2.2; it's kept here because `design-checklist.md` still references it for
markup hygiene (semantic elements over div/span soup).

| Criterion | Level | Where | Check |
|-----------|-------|-------|-------|
| 1.1.1 Non-text Content | A | Design | Meaningful images have alt; decorative images use `alt=""`; icon-only controls have an accessible name |
| 1.3.1 Info and Relationships | A | Design | Headings don't skip levels; landmarks correct; semantic elements used over div/span soup |
| 1.3.3 Sensory Characteristics | A | Cognitive | Instructions don't rely on shape, size, or position alone |
| 1.3.5 Identify Input Purpose | AA | Design | Personal-data inputs use the correct `autocomplete` token |
| 1.4.1 Use of Color | A | Design | Meaning is never carried by color alone |
| 1.4.2 Audio Control | A | Dev | Auto-playing audio over 3s has a pause/stop or independent volume control |
| 1.4.3 Contrast (Minimum) | AA | Design | Body text ≥ 4.5:1; large text ≥ 3:1 |
| 1.4.4 Resize Text | AA | Design | Nothing breaks at 200% zoom |
| 1.4.5 Images of Text | AA | Design | Real text used instead of images of text, except logos |
| 1.4.10 Reflow | AA | Design | Reflows to 320px wide with no horizontal scroll or clipped content |
| 1.4.11 Non-text Contrast | AA | Design | UI component boundaries and focus indicators ≥ 3:1 |
| 1.4.12 Text Spacing | AA | Design | Survives increased text spacing (line-height 1.5, etc.); no fixed-height text boxes |
| 1.4.13 Content on Hover or Focus | AA | Dev | Hover/focus tooltips are dismissable (Esc), hoverable, and persistent |
| 2.1.1 Keyboard | A | Dev | Everything interactive is reachable and operable by keyboard alone |
| 2.1.2 No Keyboard Trap | A | Dev | No keyboard traps |
| 2.2.2 Pause, Stop, Hide | A | Dev | Moving, auto-updating, or auto-advancing content can be paused, stopped, or hidden |
| 2.3.1 Three Flashes or Below Threshold | A | Design, Dev | No CSS produces flashing faster than 3×/second; verified live at runtime too |
| 2.4.1 Bypass Blocks | A | Design | A skip link lets keyboard users bypass repeated nav blocks |
| 2.4.2 Page Titled | A | Design | Descriptive, unique page `<title>` per page |
| 2.4.3 Focus Order | A | Dev | Tab order follows visual/reading order; no positive `tabindex` |
| 2.4.4 Link Purpose (In Context) | A | Design | Link/button text is meaningful out of context (no bare "click here") |
| 2.4.6 Headings and Labels | AA | Design | Heading levels don't skip; headings/labels are descriptive |
| 2.4.7 Focus Visible | AA | Dev | Visible focus indicator on every focusable element (no bare `outline:none`) |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Dev | Focused element isn't hidden behind sticky headers/footers or overlays |
| 2.5.1 Pointer Gestures | A | Dev | Path-based or multipoint gestures have a simple single-pointer alternative |
| 2.5.2 Pointer Cancellation | A | Dev | Actions fire on the up-event, not the down-event |
| 2.5.3 Label in Name | A | Design | Visible label text is contained in the control's accessible name |
| 2.5.7 Dragging Movements | AA | Dev | Drag-operated actions have a single-pointer alternative |
| 2.5.8 Target Size (Minimum) | AA | Design | Interactive targets ≥ 24×24px, or ≥ 24px spacing between them |
| 3.1.1 Language of Page | A | Design | `<html lang>` is set |
| 3.1.3 Unusual Words | AAA | Cognitive | Abbreviations/acronyms flagged on first unexplained use (reported, not gated) |
| 3.1.4 Abbreviations | AAA | Cognitive | Abbreviation/acronym heuristics reported as FYI |
| 3.1.5 Reading Level | AAA | Cognitive | Readability grade computed and reported; never a pass/fail gate |
| 3.2.1 On Focus | A | Dev | No surprise context change on focus |
| 3.2.2 On Input | A | Dev | No surprise context change on input |
| 3.2.3 Consistent Navigation | AA | Cognitive | Navigation appears in the same relative order across pages |
| 3.2.4 Consistent Identification | AA | Cognitive | Components with the same function are labeled/named consistently |
| 3.2.6 Consistent Help | A | Cognitive | Help/contact mechanisms, when present, sit in a consistent location |
| 3.3.1 Error Identification | A | Dev | Errors identified in text (not color alone), tied to their field |
| 3.3.2 Labels or Instructions | A | Design, Dev | Every form control has a programmatically associated label |
| 3.3.3 Error Suggestion | AA | Dev | Error messages include a suggested fix |
| 3.3.7 Redundant Entry | A | Dev | No redundant re-entry of previously supplied information |
| 3.3.8 Accessible Authentication (Minimum) | AA | Dev | Auth doesn't depend on an inaccessible cognitive function test |
| 4.1.1 Parsing | A | Design | Semantic elements used over div/span soup (obsolete as of WCAG 2.2; kept for markup hygiene) |
| 4.1.2 Name, Role, Value | A | Dev | Custom widgets expose correct name/role/value; state updates as it changes |
| 4.1.3 Status Messages | AA | Dev | Dynamic updates announce via appropriate live regions |
