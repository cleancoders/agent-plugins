# Code Review Process

## Before the Review

### Understand the Context
- Read the ticket/issue/PR description
- Understand the requirement being addressed
- Check if there's an architectural decision or design doc
- Look at related code that isn't in the diff

### Set the Right Mindset
- Assume the author did their best with the information they had
- Your job is to help, not to prove you're smarter
- Time-box reviews: 60-90 minutes max, then take a break

## During the Review

### The Review Checklist

**Correctness**
- Does the code implement the requirements correctly?
- Are edge cases handled?
- Are there off-by-one errors, null pointer risks, or race conditions?
- Does the code handle failure gracefully?

**Design**
- Is the code at the right level of abstraction?
- Does it follow SOLID principles?
- Is there unnecessary complexity?
- Are dependencies properly managed?
- Would you understand this code in 6 months without context?

**Readability**
- Are names intention-revealing?
- Are functions small and focused?
- Is the code self-documenting?
- Are comments necessary and accurate?

**Testing**
- Are there tests? Are they meaningful?
- Do tests cover the happy path AND edge cases?
- Are tests independent and repeatable?
- Would the tests catch a regression?

**Security**
- Is user input validated/sanitized?
- Are there SQL injection, XSS, or other vulnerability risks?
- Are secrets properly handled (not hardcoded)?
- Are permissions checked?

**Performance**
- Are there N+1 query problems?
- Is there unnecessary work in loops?
- Are appropriate data structures used?
- Are there memory leaks or resource exhaustion risks?

### How to Write Review Comments

**Be specific**:
- Bad: "This is confusing"
- Good: "This method mixes order validation and payment processing. Consider extracting payment into its own method for clarity."

**Explain why**:
- Bad: "Use a constant here"
- Good: "Extract 86400 to SECONDS_PER_DAY -- the next reader won't know what this magic number means."

**Offer alternatives**:
- Bad: "Don't do it this way"
- Good: "Instead of checking the type with isinstance, consider using polymorphism. Here's how: ..."

**Distinguish severity**:
- Prefix with [critical], [warning], or [suggestion]
- Or use "must", "should", "could": "This must be fixed (security)", "This should be refactored (maintainability)", "Consider renaming this (readability)"

**Ask questions when unsure**:
- "I'm not sure I understand the reasoning here -- could you explain why X?"
- This respects the author's knowledge while flagging potential issues

## After the Review

### Approval Criteria

- **Approve**: No critical issues, warnings are minor, author can address at their discretion
- **Request changes**: Critical issues or significant warnings that must be addressed
- **Comment**: Neither approve nor block -- asking questions or making suggestions

### Follow-up
- Respond promptly when the author addresses your comments
- Don't introduce new issues in re-reviews (unless the changes created them)
- Trust the author to handle minor suggestions without another review round

## Anti-Patterns in Code Review

### The Nitpicker
Focusing exclusively on style, formatting, and trivial issues while missing design problems. Automate style checks.

### The Rubber Stamp
Approving without actually reading the code. "LGTM" after 30 seconds on a 500-line change.

### The Gatekeeper
Blocking PRs for subjective preferences. "I would have done it differently" is not a valid blocker.

### The Delayed Review
Taking days to review, creating bottlenecks. Review within 24 hours.

### The Novel
Writing paragraph-long comments on every line. Be concise. Link to resources for longer explanations.
