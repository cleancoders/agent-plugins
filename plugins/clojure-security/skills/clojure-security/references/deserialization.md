# Deserialization and dependency classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.

### java-deserialization

Java deserialization sinks.

JVM deserialization gadget chains (Apache Commons Collections, etc.) → RCE.

Sinks to flag:
- `java.io.ObjectInputStream/readObject` on untrusted bytes
- `java.beans.XMLDecoder`
- SnakeYAML pre-2.0 default `Yaml()` constructor (use `SafeConstructor` or upgrade)
- `nippy/thaw` on untrusted bytes without `:incl-class-allowlist`
- Kryo without a registered class allowlist

**Grep:**
```
ObjectInputStream
XMLDecoder
new\s+Yaml\s*\(\s*\)
nippy/thaw
\bKryo\b
```

**False positives:** Deserializing bytes you wrote on the same JVM, never network-sourced, is materially safer. Still prefer a transit/EDN/JSON envelope; lower severity.

**Severity floor:** Critical for network input; High for filesystem input that other users can write to.

### transitive-cve

Transitive JVM CVEs (Log4Shell class).

Every CVE in a transitive Java dep is your CVE. `clojure.tools.logging` delegates to whatever backend is on the classpath — a transitive Log4j carries the Log4Shell risk regardless of call site.

**Detection:** `clj-watson` against `deps.edn`, plus Dependabot alerts.

**Severity:** Take from the NVD CVSS; don't re-score.
