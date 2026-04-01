# Threat Modeling

## What Is Threat Modeling?

Systematic analysis of potential security threats to a system. Done BEFORE writing code, revisited as the system evolves.

"If you don't think about security from the start, you bolt it on later -- and bolted-on security is always weaker." -- Bruce Schneier

## STRIDE Model

Microsoft's threat classification framework:

### Spoofing (Identity)
- Can an attacker pretend to be someone else?
- Mitigations: strong authentication, multi-factor, certificate pinning

### Tampering (Data Integrity)
- Can an attacker modify data in transit or at rest?
- Mitigations: checksums, digital signatures, integrity constraints, audit logs

### Repudiation (Accountability)
- Can an actor deny performing an action?
- Mitigations: audit logging, non-repudiation through digital signatures, timestamps

### Information Disclosure (Confidentiality)
- Can an attacker access data they should not see?
- Mitigations: encryption, access controls, data classification, masking

### Denial of Service (Availability)
- Can an attacker make the system unavailable?
- Mitigations: rate limiting, resource quotas, scaling, circuit breakers

### Elevation of Privilege (Authorization)
- Can an attacker gain permissions beyond what they should have?
- Mitigations: least privilege, input validation, proper authorization checks at every layer

## Threat Modeling Process

### 1. Decompose the System
- Draw a data flow diagram (DFD): processes, data stores, data flows, trust boundaries.
- Identify entry points: where external data enters the system.
- Identify assets: what is worth protecting (user data, credentials, business logic).

### 2. Enumerate Threats
- For each component in the DFD, apply STRIDE.
- "Can the user input to this API endpoint cause SQL injection?" (Tampering)
- "Can an unauthenticated user access this admin endpoint?" (Elevation of Privilege)
- Be systematic. Cover every component and every data flow.

### 3. Rate Risks
- DREAD model or simple High/Medium/Low rating:
  - Likelihood: How easy is the attack?
  - Impact: How bad is the result?
- Focus on high-likelihood, high-impact threats first.

### 4. Plan Mitigations
- For each threat, choose: mitigate (fix it), accept (document the risk), transfer (insurance), or avoid (remove the feature).
- Mitigations become requirements: "The API must validate all input against a whitelist schema."

### 5. Validate
- Review the threat model with the team.
- After implementation, verify that mitigations are in place (security-focused code review).
- Penetration testing validates that the model was correct.

## Threat Modeling for Clean Architects

Uncle Bob's Clean Architecture principles support security:

- **Dependency Rule**: External inputs (HTTP, files, databases) are at the outer layer. The domain never directly handles raw external data.
- **Boundaries**: Security checks happen at boundaries between layers. The domain trusts that data has been validated by the time it arrives.
- **DIP**: Depend on security abstractions (AuthService interface), not security implementations (JWTValidator). This allows swapping security strategies without changing business logic.

## Training Sources
- "Threat Modeling" -- Adam Shostack (the definitive book)
- OWASP Threat Modeling Guide
- Microsoft SDL Threat Modeling Process
- Uncle Bob's "The Future of Programming" (responsibility for secure systems)
- Conflicting: "Threat modeling is heavyweight and slows us down." Response: a 30-minute threat model session saves weeks of security patches later.
