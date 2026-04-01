# butunclebob.com - Key Blog Teachings

## On TDD

### "The Three Laws of TDD" (repeated across many posts)
1. You are not allowed to write any production code unless it is to make a failing unit test pass.
2. You are not allowed to write any more of a unit test than is sufficient to fail (compilation failures count).
3. You are not allowed to write any more production code than is sufficient to pass the one failing unit test.

### "TDD Harms Architecture" (2014-2017 series)
- Uncle Bob responds to critics who claim TDD leads to poor design.
- His argument: TDD done WELL leads to better design. TDD done POORLY (over-mocking, test-per-method, ignoring refactoring) can harm design.
- The key: the REFACTOR step is where design happens. If you skip it, TDD is just "test-first" which is not the same thing.
- "The tests are the first user of your code. If the tests are hard to write, the code is hard to use."

### "The Transformation Priority Premise" (2013)
- Uncle Bob proposes that just as refactorings have a catalog (Fowler), so do the transformations from failing test to passing test.
- Transformations, ordered from simple to complex:
  1. `{}->nil` (no code to returning nil/null)
  2. `nil->constant` (nil to a literal value)
  3. `constant->variable` (literal to variable)
  4. `statement->statements` (adding unconditional statements)
  5. `unconditional->conditional` (adding if/else)
  6. `scalar->collection` (variable to array/list)
  7. `statement->recursion` (iteration to recursion)
  8. `conditional->iteration` (if to while/for)
  9. `expression->function` (inlining to extracting)
  10. `variable->assignment` (replacing value)
- Prefer simpler transformations. If you need a complex transformation, you may have written the wrong test.

## On Architecture

### "Screaming Architecture" (2011)
- Your architecture should SCREAM its purpose. Looking at the top-level directory structure should tell you what the system IS, not what framework it uses.
- A health care system should have directories like `patients/`, `billing/`, `scheduling/` -- not `controllers/`, `models/`, `views/`.
- "The web is a delivery mechanism, not an architecture."

### "Clean Architecture" (2012 blog series, later became the book)
- The dependency rule: source code dependencies must point inward.
- "Architectures are not about frameworks. Architectures are about use cases."
- The goal: keep options open as long as possible. Defer database choice, UI choice, framework choice.

### "The Single Responsibility Principle" (revisited many times)
- SRP is NOT "a class should do only one thing."
- SRP IS "a module should have one, and only one, reason to change" -- meaning one, and only one, actor who might request changes.
- Example: an Employee class with `calculatePay()` (for CFO), `reportHours()` (for COO), and `save()` (for CTO) violates SRP -- three actors, three reasons to change.

## On Professionalism

### "Expecting Professionalism" (2014)
- We should expect professionals to: say no when pressured to do wrong, deliver quality, practice their craft, be honest about estimates.
- "Do you expect your doctor to wash their hands? Do you expect your mechanic to use clean oil? Then why don't we expect programmers to write tests?"

### "The Future of Programming" (2016)
- Software runs everything. Medical devices, aircraft, financial systems, elections.
- There will be a disaster caused by software, and governments will regulate us.
- We must self-regulate first: standards, ethics, practices.
- "If we don't police ourselves, we will be policed."

### "The Dark Path" (2017)
- On the danger of languages that make it easy to write bad code.
- Not an argument against any specific language -- an argument that discipline matters more than language features.

## On Clean Code in Practice

### "FizzBuzz" (multiple posts)
- Uncle Bob uses FizzBuzz to demonstrate TDD. The kata is trivial, but the discipline is not.
- He writes it incrementally: first test (returns "1"), second test (returns "2"), third test (returns "Fizz"), etc.
- The point: even trivial problems benefit from TDD's disciplined approach.

### "The Bowling Game Kata" (foundational)
- Uncle Bob's signature kata. He has performed it in conference talks hundreds of times.
- Demonstrates: start with the simplest test, grow the solution incrementally, refactor at every green.
- Available as a slide deck on butunclebob.com.

## On Collaboration

### "Pairing" (various posts)
- "Two people working at one keyboard will produce better code than either could produce alone."
- Pairing is not mentoring (though it can include mentoring). It is a productivity technique.
- The navigator thinks at a different abstraction level than the driver.
- Pairing fatigue is real. Do not pair all day every day.

### "Code Review" (various posts)
- Code review is the second-best way to spread knowledge and catch defects (pairing is first).
- Reviews should be timely (hours, not days).
- "The best code reviews catch design problems, not syntax problems. Lint catches syntax."

## Micah Martin and Justin Martin (8th Light)

### Micah Martin
- Co-founder of 8th Light with Uncle Bob.
- Wrote extensively about the apprenticeship model: apprentice -> journeyman -> craftsman.
- Key blog posts on practical TDD, pair programming, and client collaboration.
- Emphasis on business value: craftsmanship is not an excuse for gold-plating. Ship quality software that solves real problems.

### Justin Martin
- Built on Uncle Bob's and Micah's foundations with modern perspectives.
- Posts on applying clean code principles in modern ecosystems (cloud, microservices, CI/CD).
- Pragmatic voice: principles are guides, not laws. Context matters.

## Engaging Critics

### Jim Coplien ("Why Most Unit Testing is Waste")
- Argues that most unit tests test implementation, not behavior, and are therefore waste.
- Uncle Bob's response: if your unit tests test implementation, you are doing it wrong. Test behavior.
- The reconciliation: both agree that GOOD tests are valuable. They disagree on what percentage of existing tests are good.

### Gary Bernhardt ("Boundaries" and "Fast Test, Slow Test")
- Advocates functional core / imperative shell: pure functions at the center, side effects at the edges.
- Aligns with Clean Architecture's dependency rule but uses functional programming rather than OOP.
- Uncle Bob acknowledges this as a valid alternative expression of the same principles.

### David Heinemeier Hansson (DHH) ("TDD is Dead")
- "Test-first drives you to over-isolation and dependency injection hell."
- Uncle Bob: "That is TDD done badly. Well-done TDD produces good designs."
- Kent Beck: "I practice TDD differently now than I did 10 years ago. It evolves."
- The reconciliation: testing is essential. Test-first is valuable. Dogmatic test-first can be harmful. Skill and judgment matter.
