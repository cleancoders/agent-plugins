#!/usr/bin/env bash
# loader.sh - Load an agent's prompt + knowledge into a combined context
# Usage: ./loader.sh <agent-name> [--format prompt|full]
#
# Outputs the complete agent context to stdout, suitable for piping
# into an LLM as a system prompt.

set -euo pipefail

AGENTS_DIR="$(cd "$(dirname "$0")/../agents" && pwd)"

usage() {
  echo "Usage: $0 <agent-name> [--format prompt|full]"
  echo ""
  echo "  prompt  - System prompt only (default)"
  echo "  full    - System prompt + all knowledge files"
  echo ""
  echo "Available agents:"
  ls -1 "$AGENTS_DIR" 2>/dev/null || echo "  (none)"
  exit 1
}

[ $# -lt 1 ] && usage

AGENT_NAME="$1"
FORMAT="${2:---format}"
FORMAT_VALUE="${3:-full}"

if [ "$FORMAT" = "--format" ]; then
  FORMAT_VALUE="${FORMAT_VALUE:-full}"
fi

AGENT_DIR="$AGENTS_DIR/$AGENT_NAME"

if [ ! -d "$AGENT_DIR" ]; then
  echo "Error: Agent '$AGENT_NAME' not found at $AGENT_DIR" >&2
  exit 1
fi

if [ ! -f "$AGENT_DIR/prompt.md" ]; then
  echo "Error: No prompt.md found for agent '$AGENT_NAME'" >&2
  exit 1
fi

# Output the system prompt
cat "$AGENT_DIR/prompt.md"

# If full format, append all knowledge files
if [ "$FORMAT_VALUE" = "full" ]; then
  KNOWLEDGE_DIR="$AGENT_DIR/knowledge"
  if [ -d "$KNOWLEDGE_DIR" ]; then
    echo ""
    echo "---"
    echo "# Knowledge Base"
    echo ""
    for f in "$KNOWLEDGE_DIR"/*.md; do
      [ -f "$f" ] || continue
      echo "## $(basename "$f" .md | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')"
      echo ""
      cat "$f"
      echo ""
      echo "---"
      echo ""
    done
  fi
fi
