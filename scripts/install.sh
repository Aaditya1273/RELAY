#!/bin/sh
# Install RELAY into an OpenClaw workspace. Safe to re-run; never overwrites your files.
# Usage: sh scripts/install.sh [workspace-dir]
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WS="${1:-${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}}"

command -v node >/dev/null || { echo "node is required (OpenClaw already ships with it on the gateway host)"; exit 1; }
mkdir -p "$WS/skills" "$WS/memory" "$WS/relay-data"

for s in commitment-tracker relay-query relay-brief relay-followup; do
  rm -rf "$WS/skills/$s"
  cp -R "$ROOT/skills/$s" "$WS/skills/$s"
done
echo "✓ skills → $WS/skills"

# AGENTS.md: append (or refresh) a marked RELAY block; keep everything else.
BEGIN='<!-- RELAY:BEGIN -->'; END='<!-- RELAY:END -->'
touch "$WS/AGENTS.md"
TMP=$(mktemp)
awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$WS/AGENTS.md" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$TMP"
{ cat "$TMP"; [ -s "$TMP" ] && echo; echo "$BEGIN"; cat "$ROOT/prompt/AGENTS.md"; echo "$END"; } > "$WS/AGENTS.md"
rm -f "$TMP"
echo "✓ AGENTS.md (RELAY block)"

for f in SOUL.md MEMORY.md HEARTBEAT.md; do
  if [ -e "$WS/$f" ]; then echo "• $f exists — left untouched (see $ROOT/workspace/$f)"
  else cp "$ROOT/workspace/$f" "$WS/$f"; echo "✓ $f"; fi
done

node "$WS/skills/commitment-tracker/scripts/relay.mjs" --data "$WS/relay-data" --memory none list >/dev/null
echo "✓ engine runs (ledger: $WS/relay-data/ledger.json)"
cat <<EOF

Next:
  1. openclaw skills list            # expect commitment-tracker, relay-query, relay-brief, relay-followup
  2. Start a new session (/new) or: openclaw gateway restart
  3. Schedule the morning brief (edit channel/target/timezone):
     openclaw automations create "0 9 * * 1-5" "Use the relay-brief skill." \\
       --name "RELAY Morning" --tz "Asia/Kolkata" --session isolated \\
       --announce --channel slack --to "channel:C0123456789"
  See INSTALL.md for channels, multiplayer and approvals.
EOF
