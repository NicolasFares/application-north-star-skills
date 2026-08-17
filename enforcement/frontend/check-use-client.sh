#!/usr/bin/env bash
# Invariant A guardrail (R5): caps the share of "use client" files in an app.
# A rising share is a proxy for server-render regressions creeping back in.
# Also hard-fails any layout.tsx carrying the directive.
#
# Usage: check-use-client.sh [src-dir]      (default: apps/web/src)
#   USE_CLIENT_MAX_PCT=40  override the budget. Ratchet it down over time:
#   set it just above your measured share, lower it as the share falls.
#   The spec's guideline for a content app is ~30%.
set -euo pipefail

SRC="${1:-apps/web/src}"
MAX_PCT="${USE_CLIENT_MAX_PCT:-50}"

# Matches 'use client' / "use client", with or without a trailing semicolon,
# and leading whitespace (indentation) before the quote.
DIRECTIVE_RE='^[[:space:]]*["'"'"']use client["'"'"'];?[[:space:]]*$'

total=0
clients=0
status=0

# ponytail: plain newline splitting, not NUL-delimited — fine as long as your
# TS/TSX filenames never contain spaces or newlines.
while IFS= read -r f; do
  total=$((total + 1))
  if grep -qE "$DIRECTIVE_RE" "$f"; then
    clients=$((clients + 1))
    if [[ "$(basename "$f")" == "layout.tsx" ]]; then
      echo "::error::$f is a layout.tsx carrying \"use client\" — layouts must stay server components"
      status=1
    fi
  fi
done < <(find "$SRC" \( -name '*.ts' -o -name '*.tsx' \) \
  ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.spec.ts' ! -name '*.spec.tsx')

if [[ "$total" -eq 0 ]]; then
  echo "::error::No .ts/.tsx files found under $SRC"
  exit 1
fi

pct=$((clients * 100 / total))
echo "${clients}/${total} = ${pct}% (max ${MAX_PCT}%)"

if [[ "$pct" -gt "$MAX_PCT" ]]; then
  echo "::error::'use client' budget exceeded: ${pct}% > ${MAX_PCT}% (USE_CLIENT_MAX_PCT)"
  status=1
fi

exit "$status"
