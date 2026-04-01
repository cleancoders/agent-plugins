# Security Knowledge Overview

## Secure Coding Principles

### Input Validation
- Validate all input: type, length, range, format
- Whitelist over blacklist: define what IS allowed, not what is NOT
- Validate on the server side even if client-side validation exists
- Never trust data from the client, URL parameters, headers, or cookies

### Authentication & Authorization
- Authentication: verifying identity (who are you?)
- Authorization: verifying permission (what can you do?)
- Use established frameworks -- do not roll your own crypto or auth
- Implement proper session management (timeout, rotation, invalidation)
- Multi-factor authentication for sensitive operations

### Data Protection
- Encrypt sensitive data at rest and in transit
- Use TLS for all network communication
- Hash passwords with bcrypt, scrypt, or argon2 -- never MD5 or SHA alone
- Minimize data collection: do not store what you do not need

### OWASP Top 10 (Language-Agnostic Principles)
1. **Broken Access Control**: Enforce authorization on every request
2. **Cryptographic Failures**: Use strong, standard algorithms
3. **Injection**: Parameterize all queries, use ORMs, validate input
4. **Insecure Design**: Threat model during design, not after
5. **Security Misconfiguration**: Harden defaults, disable unnecessary features
6. **Vulnerable Components**: Track and update dependencies
7. **Authentication Failures**: Use established auth frameworks
8. **Data Integrity Failures**: Verify updates, use signed packages
9. **Logging Failures**: Log security events, do not log sensitive data
10. **SSRF**: Validate and sanitize all URL inputs

## Anti-Patterns
- Hardcoded secrets in source code
- SQL string concatenation
- Trusting client-side validation alone
- Error messages exposing stack traces or internal paths
- Overly permissive CORS or access controls
- Using deprecated cryptographic algorithms

## Training Sources
- OWASP Foundation materials
- "Clean Code" chapter on error handling (secure failure)
- Uncle Bob on professionalism: security IS a professional obligation
- Conflicting view: security vs. usability trade-offs (Bruce Schneier's writings)
