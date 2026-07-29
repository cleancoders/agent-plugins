# Taxonomy coverage — the reverse index

The class index in `SKILL.md` answers "what is this finding?". This file answers
"what did we fail to look at?" — which is the question an audit run has to
answer to be usable as evidence. `checked, clean` and `never examined` are
different claims and must not print the same way.

Read by `/security-audit` for its Coverage section. Not needed to triage a
single finding.

## CWE Top 25 (2025)

Verified against `https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html`
on 2026-07-29. Ranks are MITRE's, not ours.

19 of 25 are applicable to Clojure. The six that are not are memory-safety
weaknesses the JVM manages; they are listed rather than dropped so their absence
is a recorded judgment instead of an oversight.

| rank | CWE | class | route |
|------|-----|-------|-------|
| 1 | CWE-79 | `hiccup-injection`, `cljs-dom-xss` | semgrep |
| 2 | CWE-89 | `sql-injection` | semgrep |
| 3 | CWE-352 | `csrf` | llm-review |
| 4 | CWE-862 | `missing-authz` | llm-review |
| 5 | CWE-787 | (memory safety) | n/a |
| 6 | CWE-22 | `path-traversal` | semgrep (WARNING) |
| 7 | CWE-416 | (memory safety) | n/a |
| 8 | CWE-125 | (memory safety) | n/a |
| 9 | CWE-78 | `command-injection` | semgrep |
| 10 | CWE-94 | `read-string-rce`, `dynamic-eval`, `cljs-dom-xss`, `macro-runtime-input` | semgrep+llm-review |
| 11 | CWE-120 | (memory safety) | n/a |
| 12 | CWE-434 | `unrestricted-upload` | llm-review |
| 13 | CWE-476 | (no class) | n/a |
| 14 | CWE-121 | (memory safety) | n/a |
| 15 | CWE-502 | `java-deserialization` | semgrep |
| 16 | CWE-122 | (memory safety) | n/a |
| 17 | CWE-863 | `incorrect-authz` | llm-review |
| 18 | CWE-20 | (no class) | n/a |
| 19 | CWE-284 | `incorrect-authz` | llm-review |
| 20 | CWE-200 | `spec-malli-leak` (209, 550), `logging-failures` (532, 778) — partial | semgrep+llm-review |
| 21 | CWE-306 | `missing-authn` | llm-review |
| 22 | CWE-918 | `ssrf` | llm-review |
| 23 | CWE-77 | `command-injection` | semgrep |
| 24 | CWE-639 | `idor` | llm-review |
| 25 | CWE-770 | `resource-exhaustion` | llm-review |

**The two real gaps.** CWE-476 (NULL pointer dereference) is a correctness
concern that clj-kondo and reflection warnings address (deliberately
unbackticked — a backticked tool name here reads as an invented class to
`test_every_class_in_the_coverage_file_is_a_real_class`); it is not modelled
as a security class here. CWE-20 (improper input validation) is a parent
category whose Clojure-specific children — `read-string-rce`, `sql-injection`,
`mass-assignment` — each have their own class, so a CWE-20 class would only
duplicate them. Neither is covered. Report them as gaps; do not invent a class.

**CWE-200 is partial.** `spec-malli-leak` and `logging-failures` cover two
specific exposure routes. A deliberate over-broad API response that leaks fields
is neither, and is only caught by reading the handler.

## OWASP Top 10:2025

Category titles verified against `https://owasp.org/Top10/2025/` on 2026-07-29,
and cross-checked against `metadata.owasp` in the CI rules. All ten categories
have at least one class.

| category | classes | route |
|----------|---------|-------|
| A01 Broken Access Control | `missing-authz`, `incorrect-authz`, `idor`, `csrf`, `path-traversal`, `ssrf` | llm-review + semgrep (WARNING) |
| A02 Security Misconfiguration | `xxe`, `security-misconfig` | semgrep (WARNING) + llm-review |
| A03 Software Supply Chain Failures | `transitive-cve` | clj-watson |
| A04 Cryptographic Failures | `weak-crypto` | semgrep |
| A05 Injection | `read-string-rce`, `dynamic-eval`, `sql-injection`, `hiccup-injection`, `cljs-dom-xss`, `command-injection`, `macro-runtime-input` | semgrep + llm-review |
| A06 Insecure Design | `unrestricted-upload` | llm-review |
| A07 Authentication Failures | `missing-authn`, `insecure-tls-verification` | llm-review + semgrep |
| A08 Software or Data Integrity Failures | `java-deserialization`, `mass-assignment` | semgrep + llm-review |
| A09 Security Logging and Alerting Failures | `logging-failures` | llm-review |
| A10 Mishandling of Exceptional Conditions | `spec-malli-leak`, `fail-open` | semgrep |

`atom-toctou` (CWE-367) and `resource-exhaustion` (CWE-770, 400) map to no 2025
category. That is a fact about the taxonomy, not a coverage gap.

## How to report this

Three states, and never collapse the last two:

- **`findings (n)`** — looked, found something.
- **`checked, clean`** — looked, found nothing.
- **`not reachable`** — did not look. Either no class exists, the class is
  clj-watson (deliberately unbackticked, same reason as above) and the tool is
  missing, or the scope excluded the relevant files.

A category with no class and a category with a clean result must never print the
same way.
