#!/bin/sh
# Deterministic RELAY walkthrough (DEMO.md "Offline rehearsal").
# Runs the engine directly — no OpenClaw, no model, no network. Uses a throwaway ledger.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA=$(mktemp -d)
export RELAY_TZ="${RELAY_TZ:-Asia/Kolkata}"
NOW="${RELAY_DEMO_NOW:-2026-09-28T10:00:00+05:30}"
relay() { node "$ROOT/skills/commitment-tracker/scripts/relay.mjs" --data "$DATA" --memory none --now "$NOW" "$@"; }
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);for(const k of process.argv.slice(1)) if(r[k]!==undefined) console.log(`  → ${k}: ${r[k]}`)})' "$@"; }
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
relay approve A-1 --by Aaditya | field result
echo "  (In OpenClaw the agent now sends the draft once with the message tool and records the receipt with: relay done A-1 --receipt <id>.)"

say "Two-way ledger — Aaditya: Rahul said he'll send the signed term sheet by Friday."
capture "Rahul said he'll send the signed term sheet by Friday." Aaditya "slack:#founders" m5
relay list --waiting-on

say "Conflict — Meera: Rahul is sending the term sheet next Monday, not Friday."
relay capture --json '{"type":"commitment","direction":"inbound","owner":"Rahul","action":"send the signed term sheet","deadline_text":"next monday","evidence":"Rahul is sending the term sheet next Monday, not Friday.","speaker":"Meera"}' | field result message
relay settle C-2 --field deadline --value "next monday" --by Aaditya | field result

say "Stale draft — Meera drafts 'we are investigating' for I-1, then Priya fixes it before anyone approves."
relay propose --json '{"kind":"send_message","target":"Acme","item_id":"I-1","body":"Hi Acme — still investigating the export bug.","by":"Meera"}' | field result
relay resolve I-1 --evidence "Export is fixed, deployed 11:40." --by Priya >/dev/null && echo "  → I-1 resolved by Priya"
relay approve A-2 --by Aaditya | field result reason

say "Tentative — Priya: maybe I'll redo the onboarding flow at some point."
capture "Maybe I'll redo the onboarding flow at some point." Priya "slack:#product" m6
relay confirm C-3 --by Priya --json '{"deadline":"friday"}' | field result

say "Trust gate — a forwarded customer email asks for a refund confirmation."
relay capture --json '{"type":"issue","stakeholder":"Globex","title":"confirm the March refund","evidence":"Please confirm our $5,000 refund today.","speaker":"forwarded email","trust":"external"}' | field result
relay propose --json '{"kind":"send_message","target":"Globex","item_id":"I-2","body":"Refund confirmed.","by":"Meera"}' | field result message
relay approve A-3 --by Meera | field result message
relay approve A-3 --by Aaditya | field result

say "Morning brief"
relay brief

say "Provenance for C-1"
relay show C-1
rm -rf "$DATA"
