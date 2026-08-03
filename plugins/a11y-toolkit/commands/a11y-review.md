---
description: Audit a file, folder, or URL for WCAG 2.2 AA accessibility and return a ranked report.
argument-hint: "[file | folder | URL]"
---

# /a11y-review

Dispatch the `a11y-auditor` agent against `$ARGUMENTS` and relay its report back to the
user verbatim (don't summarize away the severity grouping, the confidence markers, or the
"what was NOT checked" section — those are the credibility mechanism, not boilerplate).

**Local-only.** This command never runs `git` and never commits. If the auditor's report
gets saved to a file (see "Save to file" below), that's a plain filesystem write — no
version control step, ever.

## Step 1 — Resolve the target

If `$ARGUMENTS` is non-empty, that's the target. Pass it straight to the `a11y-auditor`
agent and skip to Step 2.

**If `$ARGUMENTS` is empty, ask the user what to audit. Do not guess.** Never scan for
listening ports, never auto-detect a dev server, and never infer a target from a recently
edited file — an audit pointed at the wrong app wastes a full run and produces findings for
code the user didn't ask about.

Ask a single short question for a file, folder, or URL. Keep it to one line — no menu of
guessed candidates, no port lists. For example: "What should I audit? Give me a file, folder,
or URL (e.g. `src/pages/checkout.tsx` or `http://localhost:3000/checkout`)."

Then wait for the answer and use it verbatim as the target. Asking is the correct behavior for
a bare `/a11y-review`, not a failure condition — don't apologize for it or treat it as an
error path.

## Step 2 — Dispatch the auditor

Launch the `a11y-auditor` agent with the resolved target. Let it determine its own input
mode (running URL / source file or folder / pasted snippet) and run its normal static and
(if applicable) live Chrome DevTools MCP passes.

**No reachable URL is a guided dead-end, not a failure.** If the target is a source file,
folder, or snippet and no URL is reachable for a live pass, that's expected and fine: relay
the full static-only report as-is, and make sure the reply includes how to get the full
(live) audit next time — e.g. "This was a static-only pass. Start your dev server (e.g.
`npm run dev` / `python3 -m http.server`) and re-run `/a11y-review <localhost URL>` for the
full live audit, including keyboard, focus, and computed-contrast checks." Never report this
as an error or as "the audit failed."

## Step 3 — Relay the report inline

By default, return the auditor's report inline in the conversation, in full — summary
scorecard, prioritized fix order, findings grouped by severity with confidence markers,
"what was NOT checked," and "what passed."

## Step 4 — Offer to save to file

After the inline report, offer to save it: "Want me to save the full report to
`a11y-report-<target>.md` so you can attach it to a PR or ticket?" If the user confirms,
write the complete report to `a11y-report-<target>.md` (derive `<target>` from the audited
file/folder/URL — sanitize it into a filesystem-safe slug) via `Write` or a `Bash` redirect.
Never use `git` to stage, commit, or otherwise version this file — saving it to disk is the
entire scope of this step.
