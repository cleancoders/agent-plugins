#!/usr/bin/env bash
# Updates highlight.js vendor files from node_modules.
# Usage: Run from anywhere — the script resolves paths relative to itself.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$PLUGIN_DIR/public/vendor"
CDN_DIR="$PLUGIN_DIR/node_modules/@highlightjs/cdn-assets"

cd "$PLUGIN_DIR"

echo "Updating @highlightjs/cdn-assets..."
npm update @highlightjs/cdn-assets

mkdir -p "$VENDOR_DIR/languages"

cp "$CDN_DIR/highlight.min.js" "$VENDOR_DIR/highlight.min.js"
cp "$CDN_DIR/styles/github-dark.css" "$VENDOR_DIR/highlight-theme.css"

# Copy extra language grammars not in the common bundle
for lang in clojure clojure-repl scala elixir erlang haskell dockerfile protobuf; do
  cp "$CDN_DIR/languages/${lang}.min.js" "$VENDOR_DIR/languages/${lang}.min.js"
done

VERSION=$(node -p "require('@highlightjs/cdn-assets/package.json').version")
echo "Updated highlight.js vendor files to v${VERSION}"
