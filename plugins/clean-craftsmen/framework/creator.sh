#!/usr/bin/env bash
# creator.sh - Create a new specialist agent from a discipline name
# Usage: ./creator.sh <agent-name> [--display "Display Name"] [--desc "Description"] [--tags tag1,tag2]
#
# Creates the directory structure and template files for a new agent.
# Knowledge base content should be populated afterward (by trainer.sh or manually).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$(cd "$SCRIPT_DIR/../agents" && pwd)"

usage() {
  echo "Usage: $0 <agent-name> [--display \"Display Name\"] [--desc \"Description\"] [--tags tag1,tag2]"
  exit 1
}

[ $# -lt 1 ] && usage

AGENT_NAME="$1"
DISPLAY_NAME=""
DESCRIPTION=""
TAGS=""
WAVE=5

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --display) DISPLAY_NAME="$2"; shift 2 ;;
    --desc) DESCRIPTION="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --wave) WAVE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Default display name from agent name
if [ -z "$DISPLAY_NAME" ]; then
  DISPLAY_NAME=$(echo "$AGENT_NAME" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')
  DISPLAY_NAME="$DISPLAY_NAME Expert"
fi

AGENT_DIR="$AGENTS_DIR/$AGENT_NAME"

if [ -d "$AGENT_DIR" ]; then
  echo "Error: Agent '$AGENT_NAME' already exists at $AGENT_DIR" >&2
  exit 1
fi

echo "Creating agent: $AGENT_NAME"
echo "  Display name: $DISPLAY_NAME"
echo "  Description: ${DESCRIPTION:-"(auto-generated)"}"
echo ""

# Create directory structure
mkdir -p "$AGENT_DIR"/{knowledge,validation}

# Generate config.json
TAGS_JSON="[]"
if [ -n "$TAGS" ]; then
  TAGS_JSON=$(echo "$TAGS" | tr ',' '\n' | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
fi

cat > "$AGENT_DIR/config.json" << EOF
{
  "name": "$AGENT_NAME",
  "displayName": "$DISPLAY_NAME",
  "version": "1.0.0",
  "description": "${DESCRIPTION:-"Expert in $DISPLAY_NAME"}",
  "tags": $TAGS_JSON,
  "dependencies": [],
  "composesWellWith": [],
  "tier": "specialist",
  "wave": $WAVE,
  "validation": {
    "quizPassThreshold": 0.9,
    "reviewPassThreshold": 0.85,
    "kataPassThreshold": 0.8
  }
}
EOF

# Generate prompt template
cat > "$AGENT_DIR/prompt.md" << EOF
# $DISPLAY_NAME

You are a $DISPLAY_NAME, a specialist in the Clean Code Craftsmen team.

## Your Role

You are an expert in $(echo "$AGENT_NAME" | tr '-' ' '). You provide authoritative guidance,
review code through your specialized lens, and help developers apply best practices
in your domain.

## Core Behaviors

1. **Teach, don't just tell** - Explain the "why" behind every recommendation
2. **Show by example** - Provide concrete code examples for every principle
3. **Identify anti-patterns** - Flag violations with clear explanations
4. **Be pragmatic** - Acknowledge trade-offs; perfection is not always practical
5. **Reference sources** - Cite canonical books, papers, or talks when relevant

## Response Format

When asked a question:
1. Direct answer first
2. Explanation of underlying principle
3. Code example (if applicable)
4. Common pitfalls to avoid
5. Further reading (if relevant)

When reviewing code:
1. List findings by severity (critical > warning > suggestion)
2. For each finding: what's wrong, why it matters, how to fix it
3. Acknowledge what's done well
4. Overall assessment

---

EOF

# Generate empty validation templates
cat > "$AGENT_DIR/validation/quiz.json" << 'EOF'
{
  "agent": "AGENT_NAME_PLACEHOLDER",
  "tier": 1,
  "description": "Knowledge recall quiz",
  "questions": []
}
EOF
sed -i '' "s/AGENT_NAME_PLACEHOLDER/$AGENT_NAME/" "$AGENT_DIR/validation/quiz.json"

cat > "$AGENT_DIR/validation/code-review.json" << 'EOF'
{
  "agent": "AGENT_NAME_PLACEHOLDER",
  "tier": 2,
  "description": "Code review validation - identify issues in known-good and known-bad samples",
  "samples": []
}
EOF
sed -i '' "s/AGENT_NAME_PLACEHOLDER/$AGENT_NAME/" "$AGENT_DIR/validation/code-review.json"

cat > "$AGENT_DIR/validation/kata.json" << 'EOF'
{
  "agent": "AGENT_NAME_PLACEHOLDER",
  "tier": 3,
  "description": "Coding exercises to validate generative skill",
  "exercises": []
}
EOF
sed -i '' "s/AGENT_NAME_PLACEHOLDER/$AGENT_NAME/" "$AGENT_DIR/validation/kata.json"

# Generate placeholder knowledge file
cat > "$AGENT_DIR/knowledge/overview.md" << EOF
# $(echo "$AGENT_NAME" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1') - Overview

## Principles

(To be populated by trainer or manually)

## Patterns

(To be populated)

## Anti-Patterns

(To be populated)

## Decision Trees

(To be populated)

## References

(To be populated)
EOF

echo "Agent '$AGENT_NAME' created at $AGENT_DIR"
echo ""
echo "Next steps:"
echo "  1. Populate knowledge files in $AGENT_DIR/knowledge/"
echo "  2. Add validation questions in $AGENT_DIR/validation/"
echo "  3. Run: ./validator.sh $AGENT_NAME"
