#!/usr/bin/env bash
# Starts an anonymous local Convex backend for CI, pushes the demo functions and
# returns once they are live. The backend keeps running in the background; its
# output goes to $CONVEX_LOG (default: convex-dev.log).
#
# On a fresh checkout the deployment only exists once `convex dev` has created
# it, so the environment variables are set after it starts. GitHub OAuth is only
# exercised up to the redirect: placeholder credentials are enough unless real
# ones are provided in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
log="${CONVEX_LOG:-convex-dev.log}"
export CONVEX_AGENT_MODE=anonymous

wait_for() { # <seconds> <command...>
  local n="$1"; shift
  for _ in $(seq "$n"); do "$@" > /dev/null 2>&1 && return 0; sleep 1; done
  return 1
}
fail() { echo "$1" >&2; cat "$log" >&2; exit 1; }

nohup npx convex dev --tail-logs disable > "$log" 2>&1 &

wait_for 180 npx convex env list || fail "Convex backend did not start"
# Setting a variable can hit a write conflict while the first push and the
# crons start (503 OptimisticConcurrencyControlFailure): retry it.
wait_for 30 npx convex env set AUTH_GITHUB_CLIENT_ID "${AUTH_GITHUB_CLIENT_ID:-ci-placeholder}" || fail "Could not set AUTH_GITHUB_CLIENT_ID"
wait_for 30 npx convex env set AUTH_GITHUB_CLIENT_SECRET "${AUTH_GITHUB_CLIENT_SECRET:-ci-placeholder}" || fail "Could not set AUTH_GITHUB_CLIENT_SECRET"
wait_for 180 grep -qs "Convex functions ready" "$log" || fail "Convex functions were not pushed"
echo "Convex backend ready"
