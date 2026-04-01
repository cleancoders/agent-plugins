#!/usr/bin/env bash
# validator.sh - Run validation suite against an agent
# Usage: ./validator.sh <agent-name> [--tier 1|2|3|all] [--adapter claude|cody] [--verbose]
#
# Tier 1: Quiz (knowledge recall)
# Tier 2: Code Review (applied knowledge)
# Tier 3: Kata (generative skill)
#
# This script delegates to validate.py for the actual validation logic.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  echo "Usage: $0 <agent-name> [--tier 1|2|3|all] [--adapter claude|cody] [--verbose]"
  exit 1
}

[ $# -lt 1 ] && usage

AGENT_NAME="$1"
TIER="all"
ADAPTER="claude"
VERBOSE=""

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --tier) TIER="$2"; shift 2 ;;
    --adapter) ADAPTER="$2"; shift 2 ;;
    --verbose|-v) VERBOSE="--verbose"; shift ;;
    *) shift ;;
  esac
done

# Use the Python validation runner
exec python3 "$SCRIPT_DIR/validate.py" "$AGENT_NAME" --tier "$TIER" $VERBOSE
