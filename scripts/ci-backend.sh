#!/usr/bin/env bash
# Starts an anonymous local Convex backend (127.0.0.1:3210) for CI, pushes the
# demo functions and returns once they are live. The backend keeps running in
# the background; its output goes to $CONVEX_LOG (default: convex-dev.log).
#
# GitHub OAuth is only exercised up to the redirect, so placeholder
# credentials are enough unless real ones are provided in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
log="${CONVEX_LOG:-convex-dev.log}"
export CONVEX_AGENT_MODE=anonymous

npx convex env set AUTH_GITHUB_CLIENT_ID "${AUTH_GITHUB_CLIENT_ID:-ci-placeholder}"
npx convex env set AUTH_GITHUB_CLIENT_SECRET "${AUTH_GITHUB_CLIENT_SECRET:-ci-placeholder}"
nohup npx convex dev --tail-logs disable > "$log" 2>&1 &

for _ in $(seq 180); do
  if grep -qs "Convex functions ready" "$log"; then echo "Convex backend ready"; exit 0; fi
  sleep 1
done
cat "$log"
exit 1
