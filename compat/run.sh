#!/usr/bin/env bash
# Compatibility matrix for the published package.
#
# For every "<angular>:<node>:<convex>" row, creates a fresh Angular CLI app with
# that Node version (fnm), installs the packed angular-convex tarball, drops in
# the smoke app (compat/template) and runs a production build. compat.spec.ts
# then serves each build and drives it against a live Convex backend.
#
#   npm run build:lib && (cd dist/angular-convex && npm pack --pack-destination ../../compat)
#   compat/run.sh                       # default matrix
#   compat/run.sh 19:20:1.48.0          # one row
#   COMPAT_APPS=/some/dir compat/run.sh # where apps and logs go
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# Outside any Angular workspace: `ng new` refuses to run inside one.
apps="${COMPAT_APPS:-${TMPDIR:-/tmp}/angular-convex-compat}"
tarball="$(ls "$here"/angular-convex-*.tgz 2>/dev/null | tail -1)"
[ -n "$tarball" ] || { echo "No angular-convex-*.tgz in compat/ — pack the library first." >&2; exit 2; }

# convex >= 1.49 requires Node 22; Node 20 rows use the last release that runs there.
rows=("${@:-17:20:1.48.0 18:20:1.48.0 19:20:1.48.0 20:20:1.48.0 21:20:1.48.0 21:24:1.50.0 22:22:1.50.0 22:24:1.50.0}")
read -r -a rows <<< "${rows[*]}"

mkdir -p "$apps"
summary="$here/RESULTS.md"
{
  echo "| Angular | Node | convex | TypeScript | create | install | build |"
  echo "|---|---|---|---|---|---|---|"
} > "$summary.tmp"

for row in "${rows[@]}"; do
  IFS=: read -r ng node cvx <<< "$row"
  name="ng${ng}-node${node}"
  dir="$apps/$name"
  log="$apps/$name.log"
  run() { fnm exec --using="$node" -- "$@" >> "$log" 2>&1; }
  : > "$log"
  echo "== $name (convex $cvx)"
  create=ok install=ok build=ok
  rm -rf "$dir"
  (cd "$apps" && CI=1 NG_CLI_ANALYTICS=false run npx -y "@angular/cli@$ng" new "$name" \
      --directory "$name" --minimal --skip-git --defaults --ssr=false --style=css --routing=false) || create=FAIL
  if [ "$create" = ok ]; then
    (cd "$dir" && run npm install --no-audit --no-fund "$tarball" "convex@$cvx" "@convex-dev/auth@2.0.0") || install=FAIL
  else install=skip; fi
  if [ "$install" = ok ]; then
    cp "$here/template/smoke.ts" "$here/template/api.ts" "$dir/src/"
    cp "$here/template/main.ts" "$dir/src/main.ts"
    (cd "$dir" && CI=1 run npx ng build) || build=FAIL
  else build=skip; fi
  ts="$(cd "$dir" 2>/dev/null && node -p "require('typescript/package.json').version" 2>/dev/null || echo '?')"
  nodev="$(fnm exec --using="$node" -- node -v)"
  echo "| $ng | $nodev | $cvx | $ts | $create | $install | $build |" | tee -a "$summary.tmp"
done
mv "$summary.tmp" "$summary"
echo "Summary: $summary"
