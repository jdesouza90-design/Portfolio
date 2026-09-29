#!/bin/sh
# Make the QA tooling usable in this checkout. node_modules is gitignored, so a fresh worktree (every
# site-builder, copy-editor and blog-writer runs in one) has none. Link the main checkout's install when
# it has one; otherwise install here. Safe to run twice.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
[ -d "$here/node_modules/puppeteer-core" ] && { echo "qa tooling ready"; exit 0; }
main="$(git -C "$here" worktree list --porcelain | sed -n '1s/^worktree //p')"
if [ -n "$main" ] && [ "$main/.claude/qa" != "$here" ] && [ -d "$main/.claude/qa/node_modules/puppeteer-core" ]; then
  ln -sfn "$main/.claude/qa/node_modules" "$here/node_modules"
  echo "qa tooling linked from $main"
else
  (cd "$here" && npm install --no-audit --no-fund --silent)
  echo "qa tooling installed"
fi
