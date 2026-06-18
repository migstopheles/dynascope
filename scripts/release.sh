#!/usr/bin/env bash
# Release the dynascope CLI: bump version, build, commit, tag, push, publish.
# Usage: scripts/release.sh [patch|minor|major]   (default: patch)
set -euo pipefail

BUMP=${1:-patch}
case "$BUMP" in
  patch|minor|major) ;;
  *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;;
esac

cd "$(git rev-parse --show-toplevel)"

[[ -z $(git status --porcelain) ]] || { echo "working tree dirty" >&2; exit 1; }
[[ $(git rev-parse --abbrev-ref HEAD) == main ]] || { echo "not on main" >&2; exit 1; }
npm whoami >/dev/null 2>&1 || { echo "not logged in to npm — run \`npm login\` first" >&2; exit 1; }

git pull --ff-only origin main

# Source of truth is npm's latest, not packages/cli/package.json — they have drifted before.
LATEST=$(npm view dynascope version)
NEXT=$(node -e '
  const [latest, bump] = process.argv.slice(1);
  const [a, b, c] = latest.split(".").map(Number);
  const next = bump === "patch" ? [a, b, c + 1] : bump === "minor" ? [a, b + 1, 0] : [a + 1, 0, 0];
  console.log(next.join("."));
' "$LATEST" "$BUMP")

echo "dynascope $LATEST -> $NEXT"

node -e '
  const fs = require("fs");
  const p = "packages/cli/package.json";
  const pkg = JSON.parse(fs.readFileSync(p));
  pkg.version = process.argv[1];
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
' "$NEXT"

npm run build

git add packages/cli/package.json
git commit -m "Bump dynascope CLI to $NEXT"
git tag "v$NEXT"
git push origin main "v$NEXT"

(cd packages/cli && npm publish)

echo "Released v$NEXT"
