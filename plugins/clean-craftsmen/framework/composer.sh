#!/usr/bin/env bash
# composer.sh - Combine multiple agents for multi-discipline tasks
# Usage: ./composer.sh <primary-agent> [secondary-agents...] [--mode solo|panel|pair|review|pingpong|strongpair|mob|debate]
#
# Composition modes:
#   solo       - Single expert (just loads the primary)
#   panel      - All experts loaded, each gives independent perspective
#   pair       - Primary + one secondary collaborate (driver/navigator)
#   review     - Primary produces, secondary reviews
#   pingpong   - Two craftsmen in ping-pong TDD pairing
#   strongpair - Strong-style pairing (navigator dictates, driver implements)
#   mob        - Mob programming (3+ agents: driver, navigator, mobbers)
#   debate     - Structured discussion/debate protocol before implementation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$(cd "$SCRIPT_DIR/../agents" && pwd)"

usage() {
  echo "Usage: $0 <primary-agent> [secondary-agents...] [--mode solo|panel|pair|review]"
  exit 1
}

[ $# -lt 1 ] && usage

# Parse arguments
AGENTS=()
MODE="solo"

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    *)
      AGENTS+=("$1")
      shift
      ;;
  esac
done

[ ${#AGENTS[@]} -eq 0 ] && usage

PRIMARY="${AGENTS[0]}"
SECONDARIES=("${AGENTS[@]:1}")

# Validate all agents exist
for agent in "${AGENTS[@]}"; do
  if [ ! -d "$AGENTS_DIR/$agent" ]; then
    echo "Error: Agent '$agent' not found" >&2
    exit 1
  fi
done

# Load primary agent config
PRIMARY_DISPLAY="$PRIMARY"
if [ -f "$AGENTS_DIR/$PRIMARY/config.json" ]; then
  PRIMARY_DISPLAY=$(python3 -c "import json; print(json.load(open('$AGENTS_DIR/$PRIMARY/config.json'))['displayName'])" 2>/dev/null || echo "$PRIMARY")
fi

case "$MODE" in
  solo)
    "$SCRIPT_DIR/loader.sh" "$PRIMARY" --format full
    ;;

  panel)
    echo "# Multi-Expert Panel"
    echo ""
    echo "You are a panel of software craftsmanship experts. For the given task,"
    echo "provide perspectives from each of the following disciplines:"
    echo ""
    for agent in "${AGENTS[@]}"; do
      echo "- $agent"
    done
    echo ""
    echo "For each discipline, provide its independent assessment, then synthesize"
    echo "a unified recommendation that balances all perspectives."
    echo ""
    echo "---"
    echo ""
    for agent in "${AGENTS[@]}"; do
      echo "# $agent Expert Knowledge"
      "$SCRIPT_DIR/loader.sh" "$agent" --format full
      echo ""
    done
    ;;

  pair)
    [ ${#SECONDARIES[@]} -lt 1 ] && { echo "Error: pair mode needs at least 2 agents" >&2; exit 1; }
    SECONDARY="${SECONDARIES[0]}"
    echo "# Pair Session: $PRIMARY + $SECONDARY"
    echo ""
    echo "You are pair programming. Your primary role is $PRIMARY expertise."
    echo "Your pair partner brings $SECONDARY expertise."
    echo "Collaborate: the primary drives, the secondary navigates and advises."
    echo ""
    echo "---"
    echo ""
    echo "# Primary: $PRIMARY"
    "$SCRIPT_DIR/loader.sh" "$PRIMARY" --format full
    echo ""
    echo "# Secondary: $SECONDARY"
    "$SCRIPT_DIR/loader.sh" "$SECONDARY" --format full
    ;;

  review)
    [ ${#SECONDARIES[@]} -lt 1 ] && { echo "Error: review mode needs at least 2 agents" >&2; exit 1; }
    SECONDARY="${SECONDARIES[0]}"
    echo "# Review Mode: $PRIMARY produces, $SECONDARY reviews"
    echo ""
    echo "First, apply $PRIMARY expertise to produce a solution."
    echo "Then, apply $SECONDARY expertise to review and critique it."
    echo "Finally, revise based on the review feedback."
    echo ""
    echo "---"
    echo ""
    echo "# Producer: $PRIMARY"
    "$SCRIPT_DIR/loader.sh" "$PRIMARY" --format full
    echo ""
    echo "# Reviewer: $SECONDARY"
    "$SCRIPT_DIR/loader.sh" "$SECONDARY" --format full
    ;;

  pingpong)
    [ ${#SECONDARIES[@]} -lt 1 ] && { echo "Error: pingpong mode needs at least 2 agents" >&2; exit 1; }
    SECONDARY="${SECONDARIES[0]}"
    echo "# Ping-Pong TDD Pairing: $PRIMARY <-> $SECONDARY"
    echo ""
    echo "You are two craftsmen engaged in Ping-Pong TDD pairing."
    echo ""
    echo "## Protocol"
    echo "1. **$PRIMARY** writes a failing test (RED)."
    echo "2. **$SECONDARY** makes it pass with minimum code (GREEN), then writes the next failing test (RED)."
    echo "3. **$PRIMARY** makes it pass (GREEN), then writes the next failing test (RED)."
    echo "4. Either craftsman can call REFACTOR at any green state."
    echo "5. Both collaborate on refactoring decisions, then resume ping-pong."
    echo ""
    echo "## Communication"
    echo "Use typed messages: DRIVE, NAVIGATE, ROTATE, PAUSE, REFACTOR, CHALLENGE, PROPOSE, DECIDE."
    echo "Every challenge must cite a specific principle (SRP, OCP, YAGNI, etc.)."
    echo ""
    echo "## Rules"
    echo "- The test-writer thinks about BEHAVIOR and edge cases."
    echo "- The implementer thinks about DESIGN and structure."
    echo "- If you disagree on approach, PAUSE and use the 3-minute debate protocol."
    echo "- After the debate, the simpler approach wins unless a principle overrides."
    echo ""
    echo "---"
    echo ""
    echo "# Craftsman A: $PRIMARY"
    "$SCRIPT_DIR/loader.sh" "$PRIMARY" --format full
    echo ""
    echo "# Craftsman B: $SECONDARY"
    "$SCRIPT_DIR/loader.sh" "$SECONDARY" --format full
    ;;

  strongpair)
    [ ${#SECONDARIES[@]} -lt 1 ] && { echo "Error: strongpair mode needs at least 2 agents" >&2; exit 1; }
    SECONDARY="${SECONDARIES[0]}"
    echo "# Strong-Style Pairing: $PRIMARY (navigator) -> $SECONDARY (driver)"
    echo ""
    echo "\"For an idea to go from your head into the computer, it MUST go through"
    echo "the other person's hands.\" -- Llewellyn Falco"
    echo ""
    echo "## Protocol"
    echo "- **$PRIMARY** is the NAVIGATOR: directs at a high level of abstraction."
    echo "  - 'We need a function that validates the email format.'"
    echo "  - 'Write a test for the empty input case.'"
    echo "  - Does NOT dictate syntax or keystrokes."
    echo "- **$SECONDARY** is the DRIVER: implements the navigator's intent."
    echo "  - Chooses the algorithm, writes the code."
    echo "  - If they disagree, they explain WHY and the pair discusses briefly."
    echo "- Rotate roles after every 3 TDD cycles."
    echo ""
    echo "## Communication"
    echo "Use typed messages: NAVIGATE (navigator gives direction), DRIVE (driver acts),"
    echo "CHALLENGE (either can challenge), ROTATE (switch roles)."
    echo ""
    echo "---"
    echo ""
    echo "# Navigator: $PRIMARY"
    "$SCRIPT_DIR/loader.sh" "$PRIMARY" --format full
    echo ""
    echo "# Driver: $SECONDARY"
    "$SCRIPT_DIR/loader.sh" "$SECONDARY" --format full
    ;;

  mob)
    [ ${#AGENTS[@]} -lt 3 ] && { echo "Error: mob mode needs at least 3 agents" >&2; exit 1; }
    DRIVER="${AGENTS[0]}"
    NAVIGATOR="${AGENTS[1]}"
    MOBBERS=("${AGENTS[@]:2}")
    echo "# Mob Programming Session"
    echo ""
    echo "## Roles (Initial)"
    echo "- **Driver**: $DRIVER (types code, follows navigator's direction)"
    echo "- **Navigator**: $NAVIGATOR (directs at high abstraction, plans next steps)"
    echo -n "- **Mobbers**: "
    echo "${MOBBERS[*]}" | tr ' ' ', '
    echo "  (observe, think ahead, raise challenges during pauses)"
    echo ""
    echo "## Rotation Protocol"
    echo "After each Red-Green-Refactor cycle, rotate in a ring:"
    echo "  Driver -> Mobber pool, Navigator -> Driver, first Mobber -> Navigator"
    echo ""
    echo "## Communication"
    echo "- Only the navigator directs the driver."
    echo "- Mobbers raise hands to challenge (CHALLENGE) or suggest (PROPOSE) during PAUSE moments."
    echo "- Any mobber can VETO by citing a specific principle violation. The mob must address it."
    echo "- 3-minute time-box on debates. Navigator makes final call if no consensus."
    echo ""
    echo "## Rules"
    echo "- Navigator directs at intent level: 'Write a test for...' not 'Type if x == null'."
    echo "- Driver can ask for clarification but does not make solo design decisions."
    echo "- Rotation is MANDATORY. No hero drivers."
    echo "- REFACTOR phases are collaborative -- everyone contributes."
    echo ""
    echo "---"
    echo ""
    for agent in "${AGENTS[@]}"; do
      echo "# Agent: $agent"
      "$SCRIPT_DIR/loader.sh" "$agent" --format full
      echo ""
    done
    ;;

  debate)
    [ ${#AGENTS[@]} -lt 2 ] && { echo "Error: debate mode needs at least 2 agents" >&2; exit 1; }
    echo "# Structured Design Debate"
    echo ""
    echo "## Participants"
    for agent in "${AGENTS[@]}"; do
      echo "- $agent"
    done
    echo ""
    echo "## Protocol"
    echo ""
    echo "### Phase 1: PROPOSE (each participant independently)"
    echo "Each participant proposes an approach including:"
    echo "- **Design**: How would the code be structured?"
    echo "- **First 3 tests**: What would you test first?"
    echo "- **Trade-offs**: What does this approach sacrifice?"
    echo "- **SOLID alignment**: Which principles does this serve best?"
    echo "- **Risk**: What could go wrong?"
    echo ""
    echo "### Phase 2: CHALLENGE (each critiques the others)"
    echo "- Cite specific principles: SRP, OCP, YAGNI, DIP, etc."
    echo "- No vague criticism. Be precise about what violates what."
    echo "- Every CHALLENGE must include a COUNTER-proposal."
    echo ""
    echo "### Phase 3: CONVERGE"
    echo "- Identify areas of agreement. Start there."
    echo "- For disagreements, apply the 'Try Both' rule: try each approach for one TDD cycle."
    echo "- Let the code speak. Prefer the simpler approach (KISS/YAGNI)."
    echo ""
    echo "### Phase 4: DECIDE"
    echo "Record: chosen approach, rejected alternatives, deciding principle, confidence level."
    echo ""
    echo "**Time-box**: 3 minutes per debate point. If unresolved, try both or majority decides."
    echo ""
    echo "---"
    echo ""
    for agent in "${AGENTS[@]}"; do
      echo "# Participant: $agent"
      "$SCRIPT_DIR/loader.sh" "$agent" --format full
      echo ""
    done
    ;;

  *)
    echo "Error: Unknown mode '$MODE'. Use: solo, panel, pair, review, pingpong, strongpair, mob, debate" >&2
    exit 1
    ;;
esac
