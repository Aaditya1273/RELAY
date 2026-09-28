#!/bin/sh
# Deterministic RELAY walkthrough (DEMO.md "Offline rehearsal").
# Runs the engine directly — no OpenClaw, no model, no network. Uses a throwaway ledger.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA=$(mktemp -d)
export RELAY_TZ="${RELAY_TZ:-Asia/Kolkata}"
NOW="${RELAY_DEMO_NOW:-2026-09-28T10:00:00+05:30}"
relay() { node "$ROOT/skills/commitment-tracker/scripts/relay.mjs" --data "$DATA" --memory none --now "$NOW" "$@"; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
capture() { # text speaker channel ref
  relay extract --text "$1" --speaker "$2" --channel "$3" --ref "$4" > "$DATA/c.json"
  node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]; process.stdout.write(JSON.stringify(c))' "$DATA/c.json" > "$DATA/one.json"
  relay capture --json "$(cat "$DATA/one.json")" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(`  → ${r.result} ${r.item?.id ?? ""}`)})'
}

say "A (Aaditya, Slack #founders): I'll send Anu the investor update tonight."
capture "I'll send Anu the investor update tonight." Aaditya "slack:#founders" m1

say "B (Priya, WhatsApp support group): Acme says export is broken again."
capture "Acme says export is broken again." Priya "whatsapp:support" m2

say "C (Meera, Telegram DM): Can someone check what we're still on the hook for?"
relay extract --text "Can someone check what we're still on the hook for?" --speaker Meera | grep -q '"kind": "query"' && echo "  → recognised as a query (no new item)"
relay list

say "A: I sent Anu the update."
relay resolve C-1 --evidence "I sent Anu the update." --by Aaditya --channel "slack:#founders" --ref m4 >/dev/null && echo "  → C-1 resolved"

say "Meera: What is still open?"
relay list

say "Meera: Draft a follow-up to Acme."
relay propose --json '{"kind":"send_message","target":"Acme","channel":"whatsapp:support","item_id":"I-1","body":"Hi Acme team — we reproduced the export failure and are working on a fix. We will update you here.","by":"Meera"}' | grep -E '"(id|status)"'

say "Aaditya: approve A-1"
relay approve A-1 --by Aaditya | grep -E '"(status|instruction)"'
echo "  (In OpenClaw the agent now sends the draft once with the message tool and records the receipt with: relay done A-1 --receipt <id>.)"

say "Morning brief"
relay brief

say "Provenance for C-1"
relay show C-1
rm -rf "$DATA"
