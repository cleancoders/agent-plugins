# Secure Coding Principles

## The OWASP Top 10 (Principles, Not Just the List)

The OWASP Top 10 changes over time, but the PRINCIPLES behind them are stable:

### 1. Never Trust Input
- ALL input is potentially malicious: user input, API data, file contents, database values, environment variables.
- Validate on entry. Reject, do not sanitize (sanitization is error-prone).
- Whitelist (allow known-good) over blacklist (deny known-bad).

### 2. Injection Prevention
- SQL injection, command injection, LDAP injection, XPath injection -- all have the same root cause: mixing code and data.
- Parameterized queries / prepared statements for SQL.
- Avoid shell commands with user input. If unavoidable, use strict whitelisting.
- Template engines that auto-escape for XSS prevention.

### 3. Authentication and Authorization
- Authentication: "Who are you?" (verify identity)
- Authorization: "What can you do?" (verify permissions)
- These are SEPARATE concerns. Do not mix them.
- Hash passwords with bcrypt/scrypt/argon2. NEVER store plaintext.
- Session management: secure cookies, expiration, rotation on privilege change.
- Principle of least privilege: grant the minimum permissions necessary.

### 4. Cryptography
- Never roll your own crypto. Use established libraries.
- Encryption at rest AND in transit.
- Key management: keys are not in code, not in config files, not in environment variables in plaintext.
- TLS everywhere. No exceptions.

### 5. Error Handling (Security Perspective)
- Do not leak implementation details in error messages.
- "Login failed" (not "Password incorrect for user admin").
- Log errors server-side for debugging. Show generic errors to users.
- Uncle Bob's error handling principles (exceptions over error codes) apply here too.

### 6. Defense in Depth
- Do not rely on a single layer of defense.
- Input validation + parameterized queries + least privilege + monitoring = defense in depth.
- If one layer fails, others catch the attack.

## Secure Design Principles

### Principle of Least Privilege
Every component should have the minimum permissions needed to do its job. No more.
- Database users: read-only unless writes are needed.
- API keys: scoped to specific operations.
- File system: restrict access to necessary directories only.

### Fail Securely
When something goes wrong, fail in a way that does not expose the system.
- Default deny: if authorization fails, deny access.
- Do not leave doors open on error: if session validation fails, log out.
- Clean up resources on failure.

### Minimize Attack Surface
- Every feature, endpoint, and interface is an attack surface.
- Remove unused endpoints. Disable unnecessary features.
- Principle applies to code too: dead code is potential attack surface.
- Uncle Bob's Clean Code principle of no dead code serves security too.

### Separation of Duties
- The person who writes code should not deploy it (in critical systems).
- Automated pipelines enforce this: code is reviewed before merge, tested before deploy.
- This aligns with the craftsman/specialist model: the craftsman writes, the reviewer checks.

## Security in the Development Lifecycle

### Threat Modeling
- Before writing code, consider: what could go wrong?
- STRIDE model: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.
- For each component, ask: which STRIDE threats apply?

### Secure Code Review
- Review specifically for security, separate from general code review.
- Focus areas: input handling, authentication flows, authorization checks, data handling, error paths.
- Use SAST tools (static analysis) as a supplement, not a replacement.

### Dependency Management
- Third-party dependencies are attack vectors (supply chain attacks).
- Pin versions. Audit dependencies. Monitor for CVEs.
- Principle: fewer dependencies = smaller attack surface.

## Training Sources
- OWASP Top 10 (owasp.org) -- the industry standard list
- "The Clean Coder" by Robert C. Martin (on responsibility for the code we write)
- Uncle Bob's "The Future of Programming" -- software runs critical systems; security is our responsibility
- "Secure Coding" -- Mark Graff & Kenneth van Wyk
- Conflicting: "Security slows development." Response: security breaches slow development FAR more. Build it in from the start.
