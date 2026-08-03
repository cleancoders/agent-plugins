# ARIA authoring patterns

Copy-ready keyboard/ARIA recipes for the custom widgets most often hand-rolled and gotten wrong. Sourced from the W3C ARIA Authoring Practices Guide (APG). Use native HTML elements instead of these patterns whenever one exists (e.g. `<dialog>`, `<details>/<summary>`); reach for the ARIA version only when a native element can't do the job.

## Disclosure / accordion
- **Roles:** trigger is a `<button>`; controls the region via `aria-controls` (pointing to the disclosed panel's id).
- **States:** `aria-expanded="true|false"` on the button, flipped on toggle. In an accordion made of multiple disclosures, each button/panel pair is independent — expanding one does not require collapsing others unless the design calls for single-open-at-a-time.
- **Keys:** `Enter` / `Space` toggle the button. Focus stays on the button after toggling; it does not jump into the revealed panel.

## Modal dialog (focus trap + return)
- **Roles:** container is `role="dialog"` (or `role="alertdialog"` for a dialog that interrupts to demand a response) with `aria-modal="true"`. Labelled via `aria-labelledby` pointing at the visible dialog title (or `aria-label` if there's no visible title); `aria-describedby` optionally points at supplementary body text.
- **States:** `aria-modal="true"` is set for the lifetime of the open dialog. Content outside the dialog is made inert to assistive tech (via the `inert` attribute or `aria-hidden="true"` on sibling landmarks) while it's open, and un-inerted on close.
- **Keys:** on open, focus moves to the first focusable element inside the dialog (or to the dialog container itself, given `tabindex="-1"`, if no sensible default target exists). `Tab` / `Shift+Tab` cycle only among focusable elements inside the dialog — a focus trap — wrapping from last back to first and first back to last. `Esc` closes the dialog. On close, focus returns to the element that triggered the dialog's opening.

## Tabs
- **Roles:** container is `role="tablist"` (optionally `aria-label`/`aria-labelledby`); each tab is `role="tab"`; each panel is `role="tabpanel"`. Each tab has `aria-controls` pointing to its panel; each panel has `aria-labelledby` pointing to its tab.
- **States:** `aria-selected="true"` on the active tab, `"false"` on the rest, flipped on selection. Only the active tab has `tabindex="0"`; inactive tabs have `tabindex="-1"` (roving tabindex). Inactive panels are hidden (e.g. the `hidden` attribute).
- **Keys:** `Tab` moves focus into the tablist (landing on the active tab) and, from the active tab, out to the tabpanel's content. `Arrow Right`/`Arrow Left` (or `Arrow Down`/`Arrow Up` for a vertical tablist) move focus between tabs, wrapping at the ends; in the common automatic-activation model this also selects the newly focused tab. `Home`/`End` move focus to the first/last tab. If using the manual-activation model instead, `Enter`/`Space` activates the focused tab.

## Menu / menu button
- **Roles:** the button has `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls` referencing the menu's id. The popup is `role="menu"`; items are `role="menuitem"` (or `menuitemcheckbox`/`menuitemradio` for toggleable items).
- **States:** `aria-expanded="true|false"` on the button flips on open/close. `aria-checked="true|false"` on `menuitemcheckbox`/`menuitemradio` items flips on toggle.
- **Keys:** on the button — `Enter`/`Space`/`Down Arrow` opens the menu and moves focus to the first item; `Up Arrow` opens the menu and moves focus to the last item. Inside the menu — `Down Arrow`/`Up Arrow` move focus between items, wrapping; `Home`/`End` jump to the first/last item; typing a character jumps to the next matching item (typeahead); `Right Arrow` opens a submenu (if the focused item has one) and `Left Arrow` closes it, returning focus to the parent item; `Enter`/`Space` activates the focused item, closes the menu, and returns focus to the button; `Esc` closes the menu and returns focus to the button without activating anything.

## Combobox / autocomplete
- **Roles:** the text input is `role="combobox"` with `aria-expanded`, `aria-controls` (pointing to the popup listbox's id), and `aria-autocomplete` (`"list"`, `"both"`, or `"none"` depending on whether typing also autocompletes inline text). The popup is `role="listbox"`; each suggestion is `role="option"`.
- **States:** `aria-expanded="true|false"` on the input flips as the popup opens/closes. `aria-activedescendant` on the input is set to the id of the currently highlighted option as the user arrows through the list — this moves the "active" option without moving actual DOM focus off the input. The highlighted option carries `aria-selected="true"`.
- **Keys:** `Down Arrow` opens the popup (if closed) or moves the active option to the next item; `Up Arrow` opens the popup showing the last item (if closed) or moves to the previous item. `Enter` commits the active option's value into the input and closes the popup. `Esc` closes the popup without committing a change (first press), clearing/reverting the input on a subsequent press if the pattern supports that. Typing filters the option list and reopens/updates the popup.

## Tooltip
- **Roles:** the triggering element references the tooltip via `aria-describedby` pointing at the tooltip element's id. The tooltip element itself is `role="tooltip"`.
- **States:** the tooltip is hidden by default and made visible when its trigger receives hover or keyboard focus; it hides again on blur/unhover. It is never itself part of the tab order.
- **Keys:** the tooltip must appear on keyboard `Focus` of the trigger, not only mouse hover. `Esc` dismisses the visible tooltip without moving focus away from the trigger or otherwise dismissing the trigger's own widget.

## Alert / toast
- **Roles:** the message container is `role="alert"` for urgent, interrupting notices (implicit `aria-live="assertive"`, `aria-atomic="true"`) or `role="status"` for lower-priority toasts (implicit `aria-live="polite"`, `aria-atomic="true"`). No explicit `aria-live` attribute is needed alongside either role — it's implied.
- **States:** there is no expanded/selected state to flip; the pattern instead depends on the region already existing in the DOM (even empty) before its text content is updated, since some assistive tech won't reliably announce a role="alert"/"status" element that is inserted whole with content already inside it.
- **Keys:** the alert/toast itself takes no keyboard interaction and is never given focus automatically — its content is announced passively. If it includes a dismiss control, that control must be reachable via `Tab` and activatable via `Enter`/`Space`. Auto-dismissing toasts must stay on screen long enough (or be pausable/dismissible per WCAG 2.2.1) for assistive tech users to perceive them before they disappear.
