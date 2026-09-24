#!/usr/bin/env bash
# Type-checks, lints and tests the Supabase edge functions with Deno.
# Usage: scripts/functions.sh [check|lint|test|all]
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"
task="${1:-all}"
deno="${DENO:-deno}"

for dir in */; do
  dir="${dir%/}"
  [[ -f "$dir/deno.json" ]] || continue
  (
    cd "$dir"
    if [[ "$task" == check || "$task" == all ]]; then "$deno" check --quiet index.ts; fi
    if [[ "$task" == lint || "$task" == all ]]; then "$deno" lint --quiet . ../_shared; fi
    if [[ "$task" == test || "$task" == all ]]; then "$deno" test --quiet --allow-env .; fi
  )
done

# _shared has no deno.json of its own; test it with the first function's config.
if [[ "$task" == test || "$task" == all ]]; then
  first="$(ls -d */deno.json | head -1 | xargs dirname)"
  (cd "$first" && "$deno" test --quiet ../_shared)
fi
