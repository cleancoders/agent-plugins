# Configuration and operations classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.

These are the classes where the finding is usually an *absence* — a header not set,
a limit not imposed, a log line not written. Absence is poorly greppable, so most
entries here point at the config namespace to read rather than a pattern to match.

### security-misconfig

**CWE-16, CWE-614, CWE-1004 · OWASP A02**

Ring's defaults are safe; overriding them is where the risk enters. Also covers
missing security headers and stacktraces reaching clients.

```clojure
;; Vulnerable — anti-forgery off, cookie readable by JS and sent over plain HTTP
(wrap-defaults handler
  (-> site-defaults
      (assoc-in [:security :anti-forgery] false)
      (assoc-in [:session :cookie-attrs] {:http-only false})))

;; Safe — pin the security map explicitly rather than inheriting silently
(wrap-defaults handler
  (-> site-defaults
      (assoc-in [:session :cookie-attrs]
                {:http-only true :secure true :same-site :lax})))
```

Check for, in the handler/config namespace:
- `:anti-forgery false` on a cookie-session app
- session cookie without `:secure true` (CWE-614) or `:http-only true` (CWE-1004)
- `:same-site` unset
- no CSP header
- stacktraces or `ex-data` in production error responses

**Grep:**
```
:anti-forgery\s+false
:cookie-attrs
site-defaults|api-defaults|secure-site-defaults
Content-Security-Policy
```

**False positives:** `:secure true` is correctly absent in local dev profiles —
confirm which profile the config belongs to before reporting. `api-defaults`
legitimately omits anti-forgery for token-auth APIs.

**Fix direction:** set all three cookie attributes explicitly rather than relying on
the defaults map, so a later refactor that swaps the defaults cannot silently
weaken them.

**Severity floor:** Medium. High when the session cookie lacks `:secure` on an
HTTPS site.

### logging-failures

**CWE-778, CWE-532 · OWASP A09**

Two failure modes in one class: security events that are never logged (CWE-778),
and credentials that are (CWE-532).

```clojure
;; Vulnerable — nothing records the denial; and the whole request is dumped
(defn login [req]
  (log/info "login attempt" req)          ; logs password and session token
  (if (valid? req) (ok) (unauthorized)))  ; failure leaves no trace

;; Safe — event logged with actor/action/outcome, credentials redacted
(defn login [req]
  (let [email (get-in req [:params :email])]
    (if (valid? req)
      (do (log/info "login succeeded" {:email email}) (ok))
      (do (log/warn "login failed" {:email email}) (unauthorized)))))
```

Security events that should always be logged: authentication success and failure,
authorization denial, privilege or role change, password or MFA change, and
administrative actions.

**Grep:**
```
log/(info|debug|warn)\s+[^)]*\breq\b
log/(info|debug)\s+[^)]*(password|token|secret|authorization)
```

**False positives:** logging a request map that has already passed through a
redacting middleware.

**Fix direction:** log the event with actor, action, and outcome — never the raw
request map. Redact credential-bearing keys at the logging boundary rather than at
each call site, so a new call site cannot forget.

**Severity floor:** Medium for missing events. High when credentials are written to
logs — log aggregation usually widens who can read them.

### unrestricted-upload

**CWE-434 · OWASP A06**

Trusting client-supplied metadata about an uploaded file. `:filename` and
`:content-type` come from the request and are attacker-controlled.

```clojure
;; Vulnerable — client names the file and declares its type
(defn upload [{{{:keys [tempfile filename content-type]} :file} :params}]
  (when (= content-type "image/png")
    (io/copy tempfile (io/file "public/uploads" filename))))

;; Safe — server-generated name, sniffed content, non-served directory
(defn upload [{{{:keys [tempfile]} :file} :params}]
  (let [mime (content-type-of tempfile)]           ; sniff, do not trust
    (when (contains? #{"image/png" "image/jpeg"} mime)
      (io/copy tempfile (io/file "/var/app/uploads" (str (random-uuid) ".bin"))))))
```

**Grep:**
```
:filename
:content-type
multipart-params
io/copy\s+[^)]*tempfile
```

**False positives:** uploads written to a non-served directory with a
server-generated name already, where `:filename` is retained only as a display
label.

**Fix direction:** generate the stored name server-side, sniff the content type
rather than trusting the declared one, allowlist extensions, and store outside the
webroot. Retain the client filename as metadata only, never as a path component.

**Severity floor:** High. Critical if the upload directory is web-served or
executable.

### resource-exhaustion

**CWE-770, CWE-400 · no OWASP Top 10:2025 category**

CWE-770 is **#25 on the CWE Top 25 (2025)** yet appears in no OWASP Top 10:2025
category — it is absent from A01, A02, A06, and A10. The `(none)` in the index is
correct; do not "fix" it.

```clojure
;; Vulnerable — unbounded body, unpaginated query, unlimited login attempts
(jetty/run-jetty handler {:port 3000})
(db/find-by :event :type (:type params))
(defn login [req] (check-credentials req))

;; Safe
(jetty/run-jetty handler {:port 3000 :max-form-content-size (* 1024 1024)})
(db/find-by :event :type (:type params) :limit 100 :offset offset)
(defn login [req] (when (rate-limit-ok? (:remote-addr req)) (check-credentials req)))
```

**Grep:**
```
run-jetty|run-server|http-kit
\(slurp\s+\(:body
line-seq
db/find(-by)?\s
```

**False positives:** internal jobs and admin tools with no untrusted caller;
queries over tables with a bounded row count.

**Fix direction:** bound request size at the adapter, paginate every list query
whose filter is user-controlled, and rate-limit authentication endpoints
specifically — credential stuffing is the common case.

**Severity floor:** Medium. High on unauthenticated endpoints.

### weak-crypto

**CWE-327, CWE-328 · OWASP A04**

Broken or reversible primitives used for something security-bearing.

Detected in CI by upstream clj-holmes rules: `weak-hash-function-md5`,
`weak-hash-function-sha1`, `deprecated-blowfish`, `deprecated-desede`, and
`ecb-mode-of-operation`. This class exists so those findings can be triaged rather
than merely reported.

```clojure
;; Vulnerable
(MessageDigest/getInstance "MD5")
(Cipher/getInstance "AES/ECB/PKCS5Padding")

;; Safe
(MessageDigest/getInstance "SHA-256")
(Cipher/getInstance "AES/GCM/NoPadding")
;; passwords: bcrypt or argon2, never a bare digest
```

**Grep:**
```
MD5|SHA-?1\b
ECB
Blowfish|DESede|DES\b
MessageDigest/getInstance
```

**False positives:** MD5 or SHA-1 used as a non-security checksum — cache keys,
content-addressing, ETag generation. Real, and common. Confirm the digest is not
authenticating anything before downgrading.

**Fix direction:** SHA-256 or better for digests, AES-GCM for encryption, bcrypt or
argon2 for passwords. A bare digest is never a password hash regardless of
algorithm strength — the missing property is cost, not collision resistance.

**Severity floor:** High. Critical for password storage.

### insecure-tls-verification

**CWE-295 · OWASP A07**

Disabling certificate or hostname verification turns TLS into encryption without
authentication — it stops passive eavesdropping but not an active
machine-in-the-middle.

Note this is **A07 Authentication Failures**, not A04 Cryptographic Failures.
A04's 32-CWE list excludes CWE-295; the failure is of authentication, not of the
cipher.

Detected in CI by upstream clj-holmes rules `clojure-weak-ssl-context` and
`insecure-hostname-verifier`.

```clojure
;; Vulnerable
(http/get url {:insecure? true})
(reify javax.net.ssl.HostnameVerifier
  (verify [_ _ _] true))

;; Safe — default verification; pin a trust store only if a private CA requires it
(http/get url)
```

**Grep:**
```
:insecure\?\s+true
HostnameVerifier
X509TrustManager
setDefaultHostnameVerifier
```

**False positives:** test fixtures and local dev against self-signed certs. Verify
the code cannot reach a production profile — an `:insecure? true` behind an
environment check is materially different from an unconditional one.

**Fix direction:** use the default verifier. If a private CA is genuinely in play,
add its root to a custom trust store rather than disabling verification — a trust
store still authenticates, a disabled verifier does not.

**Severity floor:** High. Critical if the connection carries credentials or tokens.
