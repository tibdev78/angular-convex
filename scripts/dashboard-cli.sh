#!/usr/bin/env bash
# The dashboard's features, driven from the Convex CLI against the selected
# deployment: data browser, function runner, inline query, logs, environment
# variables, function metadata, import and export, health insights.
#
#   scripts/dashboard-cli.sh                         # deployment of .env.local
#   scripts/dashboard-cli.sh --env-file cloud.env    # any `npx convex` target flag
#
# It only adds data (two `events` rows tagged "dashboard-cli") and writes the
# export to a new temporary directory. Environment variable values are never
# printed, only their names.
set -euo pipefail
target=("$@")
cx() { npx convex "$1" "${target[@]}" "${@:2}"; }
section() { printf '\n=== %s ===\n' "$1"; }
work=$(mktemp -d)

section "Data: tables (convex data)"
cx data

section "Data: latest rows of a table (convex data events --limit 3)"
cx data events --limit 3 --order desc

section "Data: a component's table (convex data --component resend)"
cx data --component resend

section "Functions: metadata (convex function-spec)"
cx function-spec > "$work/spec.json"
node -e '
  const spec = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const fns = spec.functions ?? spec;
  const by = {};
  for (const f of fns) by[f.functionType ?? f.udfType ?? "?"] = (by[f.functionType ?? f.udfType ?? "?"] ?? 0) + 1;
  console.log(fns.length, "functions", JSON.stringify(by));
' "$work/spec.json"

section "Functions: run a query (convex run system:info)"
cx run system:info

section "Functions: inline readonly query (convex run --inline-query)"
cx run --inline-query 'const rows = await ctx.db.query("events").withIndex("by_kind", (q) => q.eq("kind", "error")).take(100); return { errorsInFirst100: rows.length }'

section "Data: import two rows (convex import --append --table events)"
printf '%s\n' '{"kind":"info","message":"dashboard-cli import 1","value":1}' '{"kind":"warning","message":"dashboard-cli import 2","value":2}' > "$work/events.jsonl"
cx import --append --table events --format jsonLines --yes "$work/events.jsonl"
cx run --inline-query 'return (await ctx.db.query("events").order("desc").take(2)).map((e) => e.message)'

section "Data: export (convex export --path)"
cx export --path "$work/export.zip"
unzip -l "$work/export.zip" | awk 'NR>3 && $4 ~ /documents.jsonl$/ {print $4}' | sort | head -20

section "Environment variables: names only (convex env list)"
cx env list | cut -d= -f1

section "Logs: recent history (convex logs --history 5)"
timeout 15 npx convex logs "${target[@]}" --history 5 --success || true

section "Health insights (convex insights)"
cx insights || echo "(insights are only served for cloud deployments)"

echo
echo "Work files in $work"
