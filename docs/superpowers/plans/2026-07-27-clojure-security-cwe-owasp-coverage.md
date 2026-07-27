# clojure-security CWE/OWASP Coverage — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `clojure-security` skill into an index plus on-demand references, add 15 vulnerability classes (chiefly access control), add a route-inventory procedure, and make `/security-audit` emit CWE/OWASP-tagged findings with optional file output.

**Architecture:** `SKILL.md` becomes a thin index — overview, investigation order, severity heuristic, tool blind-spot table, false-positive discipline, and a class index table. Vulnerability classes move into `references/*.md`, loaded on demand so context cost stays bounded as the class list grows. The class index table doubles as the manual half of the CWE/OWASP coverage matrix, so it cannot drift from the skill it describes. A shunit2 test enforces index↔reference consistency.

**Tech Stack:** Markdown (skill + command files), bash + shunit2 (`lib/shunit2`, tests in `test/*_test.sh`).

**Spec:** `cleancoders/github-actions` → `docs/superpowers/specs/2026-07-27-cwe-owasp-coverage-design.md`

**Repo:** This plan executes in `cleancoders/agent-plugins`. Phase 2 (the `security.yml` workflow) is a separate plan in the `github-actions` repo and does not block this one.

## Global Constraints

- **Reference editions are CWE Top 25 (2025)** and **OWASP Top 10:2025**. Never cite 2021 or 2024 categories.
- **Never infer a CWE→OWASP mapping.** Use only the mappings in the spec's "Verified mappings" section, reproduced in Task 2. Six obvious-looking inferences were wrong.
- **OWASP category token format:** `A01`–`A10`, or the literal `(none)` where no 2025 category maps. `(none)` is correct for CWE-367 and CWE-770/400.
- **The skill never auto-fixes.** Surface findings with reasoning; the human decides. This is existing policy in `security-audit.md` Step 7 and must survive.
- **Class names are stable identifiers.** Once written they are referenced by Phase 2 rule tags. Do not rename without updating the spec.
- **Tests run via** `bash test/<name>_test.sh`; CI runs `for test_file in test/*_test.sh`. Every test file ends with `. "${SCRIPT_DIR}/../lib/shunit2"`.
- **Do not hand-edit** `package.json`, `plugin.json`, `marketplace.json`, or `index.ts` version fields — CI syncs them from `VERSION`.

---

## File Structure

| path | responsibility | task |
|---|---|---|
| `test/skill-index-consistency_test.sh` | asserts index rows ↔ reference headings agree | 1 |
| `test/skill-taxonomy-ids_test.sh` | asserts CWE/OWASP token format and category validity | 2 |
| `plugins/clojure-security/skills/clojure-security/SKILL.md` | index + judgment layer only | 1, 2 |
| `.../references/injection.md` | 7 existing injection classes | 1 |
| `.../references/deserialization.md` | 2 existing classes | 1 |
| `.../references/access-control.md` | `atom-toctou` + 8 new access-control classes | 1, 3 |
| `.../references/exceptional-conditions.md` | `spec-malli-leak` + `fail-open` | 1, 5 |
| `.../references/config-and-ops.md` | 6 new config/ops classes | 5 |
| `.../references/route-inventory.md` | the route-sweep procedure | 4 |
| `plugins/clojure-security/commands/security-audit.md` | audit orchestration | 6 |
| `plugins/clojure-security/VERSION` | `0.10.0` → `0.11.0` | 7 |
| `plugins/clojure-security/CHANGES` | changelog entry | 7 |

---

### Task 1: Split SKILL.md into index + references

Mechanical move of the 11 surviving existing classes. No new content, no rewording — content added in Tasks 3–5. The `reflection` item is demoted from a class to a practice note because it is not a vulnerability (the skill already says so).

**Files:**
- Create: `test/skill-index-consistency_test.sh`
- Create: `plugins/clojure-security/skills/clojure-security/references/{injection,deserialization,access-control,exceptional-conditions}.md`
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md`

**Interfaces:**
- Produces: the class index table format `| class | CWE | OWASP 2025 | ref | ...` in `SKILL.md`, and `### <class-name>` headings in reference files. Tasks 2–5 extend both.

- [ ] **Step 1: Write the failing test**

Create `test/skill-index-consistency_test.sh`:

```bash
#!/usr/bin/env bash
# The clojure-security SKILL.md carries a class index table that doubles as the
# manual half of the CWE/OWASP coverage matrix. Each row names a reference file;
# the class must actually be documented there. A row without a heading overstates
# coverage (the matrix claims a class the skill cannot triage); a heading without
# a row hides a class from the matrix. Both directions must hold.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security"
SKILL="${SKILL_DIR}/SKILL.md"
REFS="${SKILL_DIR}/references"

# Emit "class ref" for each index-table row. Rows look like:
#   | `read-string-rce` | 94 | A05 | injection | existing |
index_rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$5); print $2, $5}'
}

# Emit "class ref" for each "### class-name" heading in each reference file.
ref_headings() {
  for f in "${REFS}"/*.md; do
    base="$(basename "${f}" .md)"
    [ "${base}" = "route-inventory" ] && continue   # a procedure, not a class
    grep -E '^### [a-z0-9-]+$' "${f}" | sed "s/^### //" | while read -r c; do
      echo "${c} ${base}"
    done
  done
}

test_references_directory_exists() {
  assertTrue "references/ must exist" "[ -d '${REFS}' ]"
}

test_every_index_row_has_a_matching_heading() {
  missing="$(comm -23 <(index_rows | sort -u) <(ref_headings | sort -u))"
  assertEquals "index rows with no matching '### class' heading in the named ref" \
    "" "${missing}"
}

test_every_heading_has_a_matching_index_row() {
  orphaned="$(comm -13 <(index_rows | sort -u) <(ref_headings | sort -u))"
  assertEquals "reference headings absent from the SKILL.md index table" \
    "" "${orphaned}"
}

test_reflection_is_not_a_class() {
  assertEquals "reflection is a practice note, not a vulnerability class" \
    "0" "$(index_rows | grep -c '^reflection ' || true)"
}

test_skill_stays_lean() {
  lines="$(wc -l < "${SKILL}")"
  assertTrue "SKILL.md must stay under 200 lines (it is ${lines}); classes belong in references/" \
    "[ ${lines} -lt 200 ]"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash test/skill-index-consistency_test.sh`
Expected: FAIL — `references/ must exist`, and `SKILL.md must stay under 200 lines (it is 341)`.

- [ ] **Step 3: Create the reference files and move classes**

Create the four files. Move each class **verbatim** from the current `SKILL.md`, changing only the heading: the numbered form `### 1. \`clojure.core/read-string\` on untrusted input — RCE` becomes the bare class-name form `### read-string-rce`, with the old descriptive title kept as the first line of body text so no information is lost.

| reference file | classes moved in (in this order) |
|---|---|
| `injection.md` | `read-string-rce`, `dynamic-eval`, `sql-injection`, `hiccup-injection`, `cljs-dom-xss`, `macro-runtime-input`, `xxe` |
| `deserialization.md` | `java-deserialization`, `transitive-cve` |
| `access-control.md` | `atom-toctou` |
| `exceptional-conditions.md` | `spec-malli-leak` |

Each file opens with a one-line purpose comment, e.g.:

```markdown
# Injection classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.
```

- [ ] **Step 4: Rewrite SKILL.md as the index**

`SKILL.md` keeps, unchanged: the `---` frontmatter, `## Overview`, `## When to apply`, `## Investigation order`, `## Severity heuristic`, `## Quick-wins audit`, `## Tool findings — coverage and blind spots`, `## False-positive discipline`, `## Out of scope here`, and `## Common mistakes when applying this skill`.

Replace the `## Vulnerability classes` section with:

```markdown
## Vulnerability classes

Classes live in `references/`. Load only the file you need — do not read them all.

| class | CWE | OWASP 2025 | ref |
|-------|-----|------------|-----|
| `read-string-rce` | 94 | A05 | injection |
| `dynamic-eval` | 94 | A05 | injection |
| `sql-injection` | 89 | A05 | injection |
| `hiccup-injection` | 79 | A05 | injection |
| `cljs-dom-xss` | 79 | A05 | injection |
| `macro-runtime-input` | 94 | A05 | injection |
| `xxe` | 611 | A02 | injection |
| `java-deserialization` | 502 | A08 | deserialization |
| `transitive-cve` | varies | A03 | deserialization |
| `atom-toctou` | 367 | (none) | access-control |
| `spec-malli-leak` | 209, 550 | A10 | exceptional-conditions |

Note `xxe` is **A02 Security Misconfiguration**, not A05 — XXE is a parser-hardening
failure in the 2025 taxonomy. `atom-toctou` (CWE-367) maps to no 2025 category.

### Reflection — a practice note, not a class

Reflection is not a vulnerability. It is an auditability smell that occasionally
surfaces unexpected method resolution under adversarial input. Set
`(set! *warn-on-reflection* true)` at the top of any namespace handling auth, authz,
or input parsing, and add type hints to clear the warnings.
```

Also update the `## Out of scope here` section: remove the "TLS / crypto primitive selection" bullet — Task 5 brings crypto in scope as `weak-crypto` and `insecure-tls-verification`, because clj-holmes already hard-fails on those findings and the skill needs to triage them.

- [ ] **Step 5: Run test to verify it passes**

Run: `bash test/skill-index-consistency_test.sh`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify no class content was lost**

Run:
```bash
git show HEAD:plugins/clojure-security/skills/clojure-security/SKILL.md | wc -l
cat plugins/clojure-security/skills/clojure-security/SKILL.md \
    plugins/clojure-security/skills/clojure-security/references/*.md | wc -l
```
Expected: the combined line count is **greater than or equal to** the original 341. A smaller number means content was dropped rather than moved.

- [ ] **Step 7: Commit**

```bash
git add test/skill-index-consistency_test.sh \
        plugins/clojure-security/skills/clojure-security/
git commit -m "refactor(clojure-security): split SKILL.md into index + references

SKILL.md was 341 lines of flat vulnerability classes, all loaded on every
invoke. Adding the access-control classes would roughly double it. Move the
11 classes into references/ and leave SKILL.md as the judgment layer plus a
class index table.

The index table doubles as the manual half of the CWE/OWASP coverage matrix,
so a new shunit2 test asserts it agrees with the reference headings in both
directions — a row without a heading would overstate coverage.

Demotes reflection from a class to a practice note; it was never a vuln."
```

---

### Task 2: Enforce CWE/OWASP token validity

Task 1's test proves the index is *structurally* consistent. This proves the taxonomy IDs are *valid* — the thing that makes the matrix trustworthy.

**Files:**
- Create: `test/skill-taxonomy-ids_test.sh`
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md` (only if Task 1 produced a malformed cell)

**Interfaces:**
- Consumes: the class index table from Task 1.
- Produces: the guarantee that every row's CWE cell is `varies` or a comma-separated list of bare integers, and every OWASP cell is `A01`–`A10` or `(none)`.

- [ ] **Step 1: Write the failing test**

Create `test/skill-taxonomy-ids_test.sh`:

```bash
#!/usr/bin/env bash
# The class index is handed to auditors as coverage evidence. A malformed or
# invented taxonomy ID makes it worse than no evidence. Six CWE-to-OWASP
# mappings that "looked obvious" were verified wrong against owasp.org, so this
# test pins the ones the design verified and rejects free-text in either column.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security/SKILL.md"

# "class|cwe|owasp" per index row.
rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/^ +| +$/,"",$3); gsub(/ /,"",$4);
                  print $2 "|" $3 "|" $4}'
}

test_cwe_column_is_integers_or_varies() {
  bad="$(rows | awk -F'|' '$2 != "varies" && $2 !~ /^[0-9]+(, ?[0-9]+)*$/ {print $1 " => " $2}')"
  assertEquals "CWE cells must be bare integers (comma-separated) or 'varies'" "" "${bad}"
}

test_owasp_column_is_a_2025_category_or_none() {
  bad="$(rows | awk -F'|' '$3 !~ /^(A0[1-9]|A10|\(none\))$/ {print $1 " => " $3}')"
  assertEquals "OWASP cells must be A01-A10 or (none)" "" "${bad}"
}

# Regression guards for the six mappings the design verified against owasp.org.
# Each was inferred wrong before verification; do not "correct" them back.
assert_mapping() {
  actual="$(rows | awk -F'|' -v c="$1" '$1 == c {print $3}')"
  assertEquals "$3" "$2" "${actual}"
}

test_verified_mappings_are_pinned() {
  assert_mapping "xxe" "A02" \
    "CWE-611 XXE is A02 Security Misconfiguration, not A05 Injection"
  assert_mapping "missing-authn" "A07" \
    "CWE-306 is A07; A01's 40-CWE list excludes it"
  assert_mapping "mass-assignment" "A08" \
    "CWE-915 is A08 Integrity Failures, not A01"
  assert_mapping "unrestricted-upload" "A06" \
    "CWE-434 is a notable CWE of A06 Insecure Design"
  assert_mapping "resource-exhaustion" "(none)" \
    "CWE-770/400 are CWE Top 25 #25 but map to no OWASP 2025 category"
  assert_mapping "insecure-tls-verification" "A07" \
    "CWE-295 is A07; A04's 32-CWE crypto list excludes it"
  assert_mapping "java-deserialization" "A08" \
    "CWE-502 is A08 only; A05's 37-CWE injection list excludes it"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash test/skill-taxonomy-ids_test.sh`
Expected: FAIL — the first two tests pass against Task 1's 11 rows, but `test_verified_mappings_are_pinned` fails because `missing-authn`, `mass-assignment`, `unrestricted-upload`, `resource-exhaustion`, and `insecure-tls-verification` do not exist yet (each `assert_mapping` compares against an empty string).

This failure is expected and correct — it is the RED that Tasks 3 and 5 turn GREEN. Do **not** weaken the test to make it pass now.

- [ ] **Step 3: Fix any malformed cells from Task 1**

Run `bash test/skill-taxonomy-ids_test.sh` and read the first two test results only. If either reports a bad cell, fix the offending row in `SKILL.md`. The `transitive-cve` row must use the literal `varies` (a per-advisory CWE), and `atom-toctou` the literal `(none)`.

- [ ] **Step 4: Verify format tests pass**

Run: `bash test/skill-taxonomy-ids_test.sh 2>&1 | grep -E 'cwe_column|owasp_column'`
Expected: no failures reported for those two tests.

- [ ] **Step 5: Commit**

```bash
git add test/skill-taxonomy-ids_test.sh \
        plugins/clojure-security/skills/clojure-security/SKILL.md
git commit -m "test(clojure-security): pin CWE/OWASP taxonomy IDs in the class index

The index is auditor-facing coverage evidence, so an invented or malformed
taxonomy ID is worse than no evidence. Rejects free text in both columns and
pins the seven mappings verified against owasp.org per-category lists.

Six of those were inferred incorrectly before verification (XXE is A02 not
A05; CWE-306 is A07 not A01; CWE-915 is A08 not A01; CWE-434 is A06;
CWE-770/400 map to no category; CWE-295 is A07 not A04), so they carry
explanatory assertion messages to stop a future reader 'correcting' them back.

test_verified_mappings_are_pinned fails until the new classes land."
```

---

### Task 3: Access-control classes

The eight classes that close OWASP A01 and five CWE Top 25 entries. This is the highest-value task in the plan.

**Files:**
- Modify: `plugins/clojure-security/skills/clojure-security/references/access-control.md`
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md` (add 8 index rows)

**Interfaces:**
- Consumes: the class-heading format `### <class-name>` and index-row format from Task 1.
- Produces: class names `missing-authz`, `incorrect-authz`, `idor`, `csrf`, `path-traversal`, `ssrf`, `missing-authn`, `mass-assignment`. Task 4 references all of them; Phase 2 rule tags reference `path-traversal`.

- [ ] **Step 1: Add the 8 index rows to SKILL.md**

Append to the class index table, preserving column order:

```markdown
| `missing-authn` | 306 | A07 | access-control |
| `missing-authz` | 862 | A01 | access-control |
| `incorrect-authz` | 863, 284 | A01 | access-control |
| `idor` | 639 | A01 | access-control |
| `csrf` | 352 | A01 | access-control |
| `path-traversal` | 22 | A01 | access-control |
| `ssrf` | 918 | A01 | access-control |
| `mass-assignment` | 915 | A08 | access-control |
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash test/skill-index-consistency_test.sh`
Expected: FAIL — `index rows with no matching '### class' heading in the named ref`, listing all eight.

- [ ] **Step 3: Write the classes**

Every class in `references/access-control.md` uses this exact template — the same shape the existing classes already use, plus a taxonomy line:

````markdown
### <class-name>

**CWE-<n> · OWASP <Axx>**

<One or two sentences: what the weakness is, in Clojure terms.>

```clojure
;; Vulnerable
<code>

;; Safe
<code>
```

**Grep:**
```
<patterns>
```

**False positives:** <one or two clauses>

**Fix direction:** <imperative sentence>

**Severity floor:** <Critical|High|Medium|Low> <condition>. <Override rule.>
````

Here is `idor` fully worked, as the reference for tone, density, and length:

````markdown
### idor

**CWE-639 · OWASP A01**

A handler that authenticates the caller but then loads a record by an ID taken
straight from the request trusts the client to only ask for its own data. Common in
c3kit bucket code, where `db/entity` happily returns any entity by id.

```clojure
;; Vulnerable — authenticated, but any user can read any invoice
(defn show-invoice [{:keys [params] :as req}]
  (when (authenticated? req)
    (ok (db/entity (->uuid (:id params))))))

;; Safe — ownership is part of the query, not a later check
(defn show-invoice [{:keys [params] :as req}]
  (when-let [user (current-user req)]
    (if-let [inv (db/ffind-by :invoice :id (->uuid (:id params)) :owner-id (:id user))]
      (ok inv)
      (not-found))))
```

**Grep:**
```
db/entity\s+\(->uuid
db/entity\s+\(:id\s+params
\(db/entity\s+[^)]*params
```

**False positives:** admin-only handlers already gated by a role check; lookups
whose id comes from the session rather than the request; reference data with no
owner (country lists, plan tiers).

**Fix direction:** push the ownership predicate into the query rather than
asserting it after the fetch — a post-fetch check still leaks existence via timing
and is easy to forget on the next handler. Return 404, not 403, so the endpoint
does not confirm the record exists.

**Severity floor:** High. Critical when the record contains PII or payment data.
Medium only when every field returned is already public.
````

Write the remaining seven to the same standard using these specifics. Do not invent
different sinks or severities:

| class | CWE·OWASP | vulnerable shape | safe shape | severity floor |
|---|---|---|---|---|
| `missing-authn` | 306 · A07 | route with no authn middleware while sibling routes under the same prefix have one | add the same guard the siblings use | High; Critical if it mutates state |
| `missing-authz` | 862 · A01 | authenticated route with no role/permission check before a privileged action | check the permission before the effect, in the same expression | High; Critical for admin surfaces |
| `incorrect-authz` | 863, 284 · A01 | guard present but weaker than siblings (checks logged-in where siblings check role) | match the strictest sibling guard | High |
| `csrf` | 352 · A01 | mutating ring route with no `ring.middleware.anti-forgery`, or `site-defaults` with `:security {:anti-forgery false}` | `wrap-anti-forgery`; token in the form / `X-CSRF-Token` header | High for cookie-session apps; Low for pure token-auth APIs with no cookie |
| `path-traversal` | 22 · A01 | `(io/file base user-input)`, `(io/resource user-input)`, `(slurp (str dir name))` | canonicalize then assert the prefix, or index an allowlist map | High; Critical if the path is then written to |
| `ssrf` | 918 · A01 | `(http/get user-url)`, `clj-http` / `hato` on a request-derived URL | allowlist the host; reject link-local and private ranges including `169.254.169.254` | High; Critical in cloud environments with an instance metadata service |
| `mass-assignment` | 915 · A08 | `(db/tx (merge existing params))` — request map merged into an entity | `select-keys` the client-writable fields explicitly | High when the entity has a role, owner, or balance field |

Note on `mass-assignment`: it lives in `access-control.md` because that is how it is
triaged during a route sweep, even though its OWASP category is A08. The index row
records A08. This is deliberate — reference-file grouping is by workflow, the
taxonomy column is by fact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash test/skill-index-consistency_test.sh && bash test/skill-taxonomy-ids_test.sh`
Expected: index-consistency PASSes all 5. Taxonomy still fails only on
`unrestricted-upload`, `resource-exhaustion`, and `insecure-tls-verification`
(Task 5), but the `missing-authn` and `mass-assignment` assertions now pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/clojure-security/skills/clojure-security/
git commit -m "feat(clojure-security): add access-control vulnerability classes

Adds missing-authn, missing-authz, incorrect-authz, idor, csrf,
path-traversal, ssrf, and mass-assignment.

OWASP A01 has been #1 for four editions and maps to five CWE Top 25 entries
(862, 863, 284, 639, plus 306 under A07). The skill had no authorization class
at all, and no scanner can supply one, so this is the largest single coverage
gap being closed.

mass-assignment is filed under access-control because that is where a route
sweep encounters it, while its index row correctly records A08."
```

---

### Task 4: Route-inventory procedure

The mechanism that makes Task 3's classes findable. Structurally different from every other reference file: a procedure, not a pattern catalogue. Task 1's test already excludes it from the class↔heading check.

**Files:**
- Create: `plugins/clojure-security/skills/clojure-security/references/route-inventory.md`
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md` (one pointer line)

**Interfaces:**
- Consumes: class names from Task 3.
- Produces: the route-matrix table format `route | method | handler | authn | authz | owns-check | notes`, consumed by Task 6's report section.

- [ ] **Step 1: Write the procedure file**

Create `references/route-inventory.md`:

````markdown
# Route inventory sweep

A procedure, not a pattern class. Load when auditing access control — the
`missing-authn`, `missing-authz`, `incorrect-authz`, `idor`, and `csrf` classes are
all found this way. No scanner can do this: "this handler is missing an authz
check" requires knowing the application's route table and its own conventions.

## Why comparison, not rules

There is no universal signature for "should have been protected." Instead, compare
each route against its siblings and let the codebase state its own intent. An
application where *every* route is unauthenticated yields no findings — correctly,
since it may be a public API. The signal is **inconsistency**, not absence.

## Step 1 — Locate routes

```
rg -n 'defroutes|context\s+"|GET\s+"|POST\s+"|PUT\s+"|DELETE\s+"'   # compojure
rg -n '\["/' --type clojure                                          # reitit vectors
rg -n ':handler\s|:middleware\s'                                     # reitit route data
rg -n 'defroute'                                                     # secretary (CLJS — client-side, see caveat)
rg -n 'wrap-|ring.middleware'                                        # middleware stack
```

**Caveat:** secretary `defroute` is client-side routing. It is never an
authorization boundary. Record CLJS routes only to find server endpoints they call;
never report a missing guard on one.

## Step 2 — Per route, record

- path and method
- handler var
- **authn guard in effect** — walk the middleware stack outward from the handler,
  including `context`-level and router-level `:middleware`. A guard applied at the
  router covers every child route; missing that is the most common false positive.
- **authz guard** — role or permission check, wherever it appears
- **ownership check** — if the handler accepts an entity id, is that id constrained
  to the caller?

## Step 3 — Emit the matrix

```
| route | method | handler | authn | authz | owns-check | notes |
|-------|--------|---------|-------|-------|------------|-------|
| /api/invoices/:id | GET | show-invoice | wrap-auth | — | no | reads by params id |
```

Use `—` for absent, `?` for could-not-trace. Never leave a cell blank.

## Step 4 — Flag by sibling comparison

| condition | class | CWE |
|-----------|-------|-----|
| no authn guard, siblings under the same prefix have one | `missing-authn` | 306 |
| no authz guard, siblings under the same prefix have one | `missing-authz` | 862 |
| authn present, accepts an entity id, no ownership check | `idor` | 639 |
| guard weaker than siblings (logged-in where siblings check role) | `incorrect-authz` | 863 |
| mutating verb, no anti-forgery middleware, cookie session | `csrf` | 352 |

## Step 5 — Severity and provisionality

Apply the skill's three-axis heuristic. Any route with a `?` in the authn or authz
column is **provisional** — report it as "guard could not be traced," not as a
missing guard. Overstating an untraced guard is the failure mode that makes
reviewers stop trusting the sweep.

## Cost control

This sweep is token-heavy on large route tables. On `diff` / `staged` scopes, run it
only when a route-defining file is in the diff. On `all` scope, run it always.
````

- [ ] **Step 2: Add the pointer to SKILL.md**

Immediately below the class index table:

```markdown
Access-control findings come from a route sweep rather than pattern matching — see
`references/route-inventory.md`. No scanner covers this; it is the skill's
highest-value output.
```

- [ ] **Step 3: Run tests to verify nothing regressed**

Run: `bash test/skill-index-consistency_test.sh`
Expected: PASS, 5 tests. `route-inventory.md` is skipped by `ref_headings()`, so
adding it must not produce orphaned-heading failures. If it does, the skip in the
test is broken — fix the test, not the procedure file.

- [ ] **Step 4: Commit**

```bash
git add plugins/clojure-security/skills/clojure-security/
git commit -m "feat(clojure-security): add the route-inventory sweep procedure

Access-control weaknesses cannot be pattern-matched: 'this handler is missing
an authz check' requires the application's route table and its own conventions.

The sweep compares each route to its siblings rather than applying absolute
rules, so it needs no codebase convention and stays quiet on genuinely public
APIs. Untraceable guards are reported as provisional rather than missing."
```

---

### Task 5: Exceptional-conditions and config/ops classes

Closes A10, A02, A09, A06, A04, and the remaining A07 entry. Turns the last three assertions in Task 2's test green.

**Files:**
- Modify: `plugins/clojure-security/skills/clojure-security/references/exceptional-conditions.md`
- Create: `plugins/clojure-security/skills/clojure-security/references/config-and-ops.md`
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md` (7 index rows)

**Interfaces:**
- Consumes: the class template from Task 3.
- Produces: class names `fail-open`, `security-misconfig`, `logging-failures`, `unrestricted-upload`, `resource-exhaustion`, `weak-crypto`, `insecure-tls-verification`. Phase 2 rule tags reference `fail-open`.

- [ ] **Step 1: Add the 7 index rows to SKILL.md**

```markdown
| `fail-open` | 636, 396 | A10 | exceptional-conditions |
| `security-misconfig` | 16, 614, 1004 | A02 | config-and-ops |
| `logging-failures` | 778, 532 | A09 | config-and-ops |
| `unrestricted-upload` | 434 | A06 | config-and-ops |
| `resource-exhaustion` | 770, 400 | (none) | config-and-ops |
| `weak-crypto` | 327, 328 | A04 | config-and-ops |
| `insecure-tls-verification` | 295 | A07 | config-and-ops |
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash test/skill-index-consistency_test.sh`
Expected: FAIL — seven index rows with no matching heading.

- [ ] **Step 3: Write the classes**

Use the Task 3 template verbatim. Specifics, not to be improvised:

| class | CWE·OWASP | vulnerable shape | safe shape | severity floor |
|---|---|---|---|---|
| `fail-open` | 636, 396 · A10 | `(try (authorized? u) (catch Exception _ true))`; any `catch` around a security decision that returns a permissive default; bare `(catch Exception _ nil)` swallowing an auth error | catch narrowly, log, and deny — the failure path must be the restrictive one | High when the swallowed decision is a security check; Low for a genuinely optional side effect |
| `security-misconfig` | 16, 614, 1004 · A02 | `site-defaults` with `:security {:anti-forgery false}`; session cookie without `:secure true` / `:http-only true`; `:same-site` unset; no CSP header; stacktraces in prod responses | pin the ring-defaults security map explicitly; set all three cookie attributes | Medium; High when the session cookie lacks `:secure` on an HTTPS site |
| `logging-failures` | 778, 532 · A09 | no log line on authn failure, authz denial, or privilege change; conversely `(log/info "req" req)` dumping tokens, passwords, or session values | log security events with actor, action, and outcome; redact credential-bearing keys before logging | Medium; High when credentials are written to logs (CWE-532) |
| `unrestricted-upload` | 434 · A06 | trusting `:filename` or `:content-type` from a multipart part; writing under a client-supplied name | generate the stored name server-side, sniff content, allowlist extensions, store outside the webroot | High; Critical if the upload directory is served or executable |
| `resource-exhaustion` | 770, 400 · (none) | no `:max-body` on the ring adapter; unbounded `line-seq` / `slurp` of a request; unpaginated `db/find` on a user-controlled filter; no rate limit on login | bound request size, paginate every list query, rate-limit authentication endpoints | Medium; High on unauthenticated endpoints |
| `weak-crypto` | 327, 328 · A04 | MD5 or SHA-1 for anything security-bearing; ECB mode; Blowfish or DESede; unsalted password hashes | SHA-256+ for digests, AES-GCM for encryption, bcrypt/argon2 for passwords | High; Critical for password storage |
| `insecure-tls-verification` | 295 · A07 | a permissive `HostnameVerifier`; a trust-all `X509TrustManager`; `:insecure? true` on clj-http | use the default verifier; pin a custom trust store if a private CA is genuinely needed | High; Critical if the connection carries credentials |

`resource-exhaustion` must state plainly in its body that it maps to **no OWASP
Top 10:2025 category** despite being CWE Top 25 #25, so a future reader does not
"fix" the `(none)`.

`weak-crypto` and `insecure-tls-verification` are new to the skill but not to CI:
clj-holmes already hard-fails on MD5, SHA-1, Blowfish, DESede, ECB, weak SSL context,
and insecure hostname verifiers. Each class body must note which upstream clj-holmes
rule produces the finding, so a triager can connect the CI output to the guidance.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash test/skill-index-consistency_test.sh && bash test/skill-taxonomy-ids_test.sh`
Expected: both PASS in full. This is the first point at which
`test_verified_mappings_are_pinned` goes green.

- [ ] **Step 5: Commit**

```bash
git add plugins/clojure-security/skills/clojure-security/
git commit -m "feat(clojure-security): add exceptional-conditions and config/ops classes

Adds fail-open, security-misconfig, logging-failures, unrestricted-upload,
resource-exhaustion, weak-crypto, and insecure-tls-verification.

A10 Mishandling of Exceptional Conditions is new in OWASP 2025 and maps
unusually well onto Clojure: CWE-396 is literally (catch Exception e ...) and
CWE-636 is a permissive default on a swallowed security decision.

weak-crypto and insecure-tls-verification were previously listed as out of
scope, which left the skill unable to triage findings clj-holmes already
hard-fails on. Each notes its upstream rule.

resource-exhaustion is CWE Top 25 #25 but maps to no OWASP 2025 category;
the class body says so to stop a future reader 'fixing' the (none)."
```

---

### Task 6: Update the /security-audit command

**Files:**
- Modify: `plugins/clojure-security/commands/security-audit.md`

**Interfaces:**
- Consumes: class names from Tasks 3 and 5; the route-matrix format from Task 4.
- Produces: the report format that Phase 2's evidence trail pairs with.

- [ ] **Step 1: Replace the duplicated grep block (Step 3 of the command)**

The command currently inlines the skill's patterns under a `keep in sync` comment —
a drift smell that predates this work and would now need updating for 15 new classes.
Replace the entire pattern listing with:

```markdown
## Step 3 — Pattern sweep

Run the `## Quick-wins audit` grep block from `SKILL.md` against the scope, plus the
**Grep:** block from each reference file relevant to the scope. Use `rg` with
`--type clojure` and `--type edn` for whole-repo scope; otherwise pass explicit paths.

Do not restate the patterns here — they live in the skill, and a copy would drift.

Note: `\bread-string\b` matches both `clojure.core/read-string` (vulnerable) and
`clojure.edn/read-string` (safe by default). Inspect each hit's namespace prefix
before classifying.
```

- [ ] **Step 2: Add the route sweep as a new Step 4**

Insert before the existing tool-invocation step, renumbering the rest:

```markdown
## Step 4 — Route inventory sweep

Load `references/route-inventory.md` and run the procedure.

Run it always on `all` scope. On `diff` / `staged`, run it only if the diff touches
a route-defining file (matches `route`, `handler`, `middleware`, `api`, or `main` in
the path, or contains `defroutes` / `defroute` / a reitit route vector). Otherwise
state `route sweep: skipped (no route files in scope)` in the report.

The resulting matrix goes in its own report section. Rows with a `?` in the authn or
authz column are provisional findings, not confirmed gaps.
```

- [ ] **Step 3: Add CWE/OWASP columns to the report format (Step 6 of the command)**

Change the finding line format from:

```
  path/to/file.clj:42  [class-name]  <one-line problem>. <fix direction>.
```

to:

```
  path/to/file.clj:42  [class-name]  CWE-89 · A05  <one-line problem>. <fix direction>.
```

Add two sections to the report template, after `## Low`:

```
## Route matrix
  | route | method | handler | authn | authz | owns-check | notes |
  |-------|--------|---------|-------|-------|------------|-------|
  …
  (or: route sweep: skipped (no route files in scope))

## Coverage
  Classes checked:  <n> of <total>
  Classes skipped:  <list with one-clause reasons>
  CWE Top 25 (2025) touched:   <ids>
  OWASP Top 10:2025 touched:   <categories>
```

The Coverage section is what makes an audit run usable as evidence. Take the class
list from `SKILL.md`'s index table — never from memory.

- [ ] **Step 4: Add the file-output argument**

Update the frontmatter `argument-hint`:

```markdown
argument-hint: "[scope] [--write] — scope: <path>|diff|staged|all (default: all); --write saves the report to docs/security-audits/"
```

And add to the end of the command, before `## Step 7 — Stop`:

```markdown
## Step 6b — Optional file output

Default is stdout only. If the arguments contain `--write`, additionally save the
report to `docs/security-audits/YYYY-MM-DD-<git short SHA>.md`, creating the
directory if needed, and print the path.

Writing a file is the only side effect this command may ever have, and only on
explicit request. Everything else in Step 7 still applies: do not edit code, do not
stage, do not commit.
```

- [ ] **Step 5: Verify the command has no stale pattern list**

Run:
```bash
grep -nE 'ObjectInputStream|explain-data|dangerouslySetInnerHTML' \
  plugins/clojure-security/commands/security-audit.md
```
Expected: **no output.** Any hit means a duplicated pattern block survived Step 1.

- [ ] **Step 6: Verify every class name used in the command exists in the index**

Run:
```bash
SKILL=plugins/clojure-security/skills/clojure-security/SKILL.md
CMD=plugins/clojure-security/commands/security-audit.md
grep -oE '`[a-z0-9-]+`' "${CMD}" | tr -d '`' | sort -u > /tmp/cmd-names
grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" | awk -F'|' '{gsub(/[ `]/,"",$2); print $2}' | sort -u > /tmp/idx-names
comm -23 /tmp/cmd-names /tmp/idx-names
```
Expected: output contains no class-shaped names. Scope words (`all`, `diff`,
`staged`) and filenames are fine; a name like `read-string-rce` appearing here means
the command references a class the index does not define.

- [ ] **Step 7: Commit**

```bash
git add plugins/clojure-security/commands/security-audit.md
git commit -m "feat(clojure-security): route sweep and CWE/OWASP tagging in /security-audit

Adds the route-inventory sweep as a first-class audit step, tags every finding
with its CWE and OWASP category, and adds a Coverage section reporting which
classes were checked versus skipped — the part that makes an audit run usable
as evidence rather than just a list.

Step 3 no longer restates the skill's grep patterns. The command carried a
duplicate under a 'keep in sync' comment; with 15 new classes that copy would
have drifted immediately.

Adds opt-in --write for docs/security-audits/. Stdout stays the default so the
command keeps its no-surprise-side-effects property."
```

---

### Task 7: Release 0.11.0

**Files:**
- Modify: `plugins/clojure-security/VERSION`
- Modify: `plugins/clojure-security/CHANGES`

**Interfaces:**
- Consumes: everything above.
- Produces: the released plugin version Phase 2's README references.

- [ ] **Step 1: Run the full test suite**

Run:
```bash
for f in test/*_test.sh; do echo "== ${f}"; bash "${f}" || echo "FAILED: ${f}"; done
```
Expected: no `FAILED:` lines. Both new test files pass, and no pre-existing test
regressed — `security-stop-holmes_test.sh` and `holmes-autofetch_test.sh` touch the
same plugin and are the likeliest to break.

- [ ] **Step 2: Manual verification against a fixture**

Skill behavior is LLM behavior; there is no assertion to write. This is the one-time
manual check the spec calls for, and it is a real gate, not a formality.

In a scratch directory, create a minimal Clojure app with `deps.edn` and one planted
instance of each of: `idor` (a `db/entity` on a params id inside an authenticated
handler), `missing-authn` (two sibling routes, one guarded and one not),
`csrf` (a POST route under `site-defaults` with anti-forgery disabled),
`path-traversal` (`(io/file "uploads" (:name params))`),
`fail-open` (`(try (authorized? u) (catch Exception _ true))`), and
`sql-injection` (a `str`-built query).

Run `/security-audit all` against it. Confirm each planted issue is reported with the
correct class name, CWE, and OWASP category, that the route matrix lists both sibling
routes, and that the Coverage section names the classes it skipped.

Record the result in the commit message. If a class does not fire, fix its reference
file and re-run before proceeding — a class that does not fire is not coverage,
and the matrix would claim it.

- [ ] **Step 3: Bump VERSION**

```bash
echo "0.11.0" > plugins/clojure-security/VERSION
```

- [ ] **Step 4: Prepend the CHANGES entry**

Match the existing prose-bullet style — explain *why*, not just *what*:

```markdown
## 0.11.0
  * SKILL.md is now an index plus `references/`, loaded on demand. It was 341
    lines of flat vulnerability classes read on every invoke; adding the
    access-control classes would have roughly doubled that. The class index
    table doubles as the manual half of the CWE/OWASP coverage matrix, and a
    shunit2 test asserts it agrees with the reference files in both directions.
  * Adds 15 vulnerability classes. The eight access-control ones matter most:
    OWASP A01 has been #1 for four editions and maps to five CWE Top 25 entries,
    and the skill previously had no authorization class at all. No SAST tool
    covers this, so it could only be closed here.
  * Adds `references/route-inventory.md`, a route sweep that finds missing and
    inconsistent guards by comparing each route to its siblings rather than
    applying absolute rules — so it needs no codebase convention and stays quiet
    on genuinely public APIs.
  * Every class now carries its CWE ID and OWASP Top 10:2025 category, and
    `/security-audit` tags findings with both plus a Coverage section. Mappings
    were verified against owasp.org per-category lists; six obvious-looking
    inferences were wrong (XXE is A02 not A05, CWE-306 is A07 not A01, CWE-915
    is A08, CWE-434 is A06, CWE-770/400 map to no category, CWE-295 is A07 not
    A04) and are pinned by test.
  * `weak-crypto` and `insecure-tls-verification` move from "out of scope" into
    the class list. clj-holmes already hard-fails on these findings, so the skill
    could not triage output the pipeline was already producing.
  * `/security-audit` gains `--write` for `docs/security-audits/`. Stdout remains
    the default.
  * Step 3 of `/security-audit` no longer duplicates the skill's grep patterns.
```

- [ ] **Step 5: Commit**

```bash
git add plugins/clojure-security/VERSION plugins/clojure-security/CHANGES
git commit -m "chore(clojure-security): release 0.11.0

Manual fixture verification: all six planted findings fired with correct
class, CWE, and OWASP tags; route matrix listed both sibling routes."
```

- [ ] **Step 6: Push and confirm CI**

```bash
git push origin master
```

CI (`build-plugins.yml`) runs the bash tests, syncs the version into
`package.json` / `plugin.json` / `marketplace.json`, builds the bundle, and tags
`clojure-security/v0.11.0`. Do not hand-edit those synced files.

Confirm the tag exists before treating the release as done:
```bash
git fetch --tags && git tag -l 'clojure-security/v0.11.0'
```
Expected: `clojure-security/v0.11.0`

---

## Self-Review

**Spec coverage.** Every Phase 1 element in the spec maps to a task: file layout → Task 1; class index with all 26 rows → Tasks 1, 3, 5; route-inventory procedure → Task 4; command changes (grep dedup, route step, CWE/OWASP columns, `--write`) → Task 6; verified-mappings discipline → Task 2; manual fixture verification → Task 7 Step 2. Phase 2 is out of scope by design and has its own plan.

**Deviation from the spec, deliberate:** the spec's file layout lists `access-control.md` holding 8 new classes and `config-and-ops.md` holding 5. This plan puts `mass-assignment` in `access-control.md` (9 there, 6 in config-and-ops) because that is where a route sweep encounters it, while its index row still records A08. Grouping is by workflow; the taxonomy column is by fact.

**Placeholder scan.** No TBDs. Content-authoring steps give a full worked example plus a specifics table naming the exact sinks, safe forms, and severity floors for every class, so nothing is left to invention. Every verification step names a command and its expected output.

**Type consistency.** Class names are identical across the index tables, reference headings, route-inventory flag table, Task 2 assertions, and commit messages: `missing-authn`, `missing-authz`, `incorrect-authz`, `idor`, `csrf`, `path-traversal`, `ssrf`, `mass-assignment`, `fail-open`, `security-misconfig`, `logging-failures`, `unrestricted-upload`, `resource-exhaustion`, `weak-crypto`, `insecure-tls-verification`. The `access-control` / `config-and-ops` / `exceptional-conditions` / `injection` / `deserialization` ref tokens match the filenames minus `.md`, which is what Task 1's test compares.

**Intentional cross-task RED.** Task 2's `test_verified_mappings_are_pinned` fails on purpose from Task 2 until Task 5. Task 2 Step 2 says so explicitly and forbids weakening the test. If tasks are executed by separate agents, that agent must not "fix" it.
