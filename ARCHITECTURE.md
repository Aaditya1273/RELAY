# Architecture

RELAY is a workspace package for OpenClaw: skills + operating rules + a small engine.
It does not fork or patch OpenClaw.

## Loop

```
INGEST     message arrives in any session (DM, group, email thread)
EXTRACT    model reads it with the commitment-tracker skill; optional heuristic pre-pass (`relay extract`)
NORMALIZE  owner / counterparty / action / deadline → structured record; relative dates resolved in RELAY_TZ
PERSIST    `relay capture` → dedupe → ledger.json (+ one line in memory/YYYY-MM-DD.md)
RECALL     `relay list|show|changes|people`, `relay brief` (scheduled automation)
CONFLICT   a different deadline/owner from another teammate → conflict X-n, kept value; `relay settle`
TENTATIVE  low-confidence captures wait as `tentative` → `relay confirm` / `relay reject`
FOLLOW UP  `relay propose` → draft A-n bound to the item's version; risk = normal | high (external-only evidence, unknown target)
APPROVE    `approve A-n` → stale if the item changed · blocked by open conflicts · high risk needs 2 distinct approvers
RESOLVE    `relay resolve` with evidence;  "approve A-n" → message tool → `relay done` with receipt
ARCHIVE    resolved/cancelled items stay in the ledger with full history (`--status all`)
```

## Why a shared file (and not MEMORY.md or session memory)

- OpenClaw loads `MEMORY.md` only in the private main session; group conversations omit it.
- On the Plow base image, cross-conversation recall is disabled and group/peer sessions
  cannot read unrelated conversations.
- A workspace file read through `exec` is visible to every session of the agent. That
  makes it the smallest mechanism that actually shares state across people and channels.

The file is JSON so the engine can dedupe, filter and compute overdue deterministically,
instead of asking the model to re-read prose each time.

## Division of labour

| Model (skills) | Engine (`relay.mjs`) |
| --- | --- |
| Decide whether a message is a commitment/issue/decision/resolution | Validate required fields and evidence |
| Fill in owner/counterparty from context, ask when unclear | Refuse low-confidence records |
| Pick which item a "done" refers to | Deduplicate (same message ref; Jaccard ≥ 0.6 on the action with matching party/alias) |
| Write drafts and replies | Resolve relative deadlines; compute overdue/due-today/stale |
| Execute approved actions with real tools | Enforce approve → execute-once → receipt; idempotency keys |
| | Cross-process lock + atomic write; secret redaction; audit log |

## Data model (`relay-data/ledger.json`)

```jsonc
{
  "version": 1,
  "seq": { "C": 3, "I": 1, "D": 1, "A": 1 },
  "items": [{
    "id": "C-1", "type": "commitment", "status": "open|tentative|resolved|cancelled|rejected",
    "direction": "outbound|inbound",   // inbound: owner is outside the team and owes us; counterparty "team"
    "owner": "Aaditya", "counterparty": "Anu", "action": "send the investor update",
    "conflicts": [{ "id": "X-1", "field": "deadline|owner", "current_text": "friday", "current_by": "Aaditya",
                    "proposed_text": "monday", "by": "Meera", "status": "open|settled" }],
    "deadline": "2026-09-28T18:29:00.000Z", "deadline_text": "tonight",
    "next_action": "send the investor update", "confidence": "high",
    "source_channel": "slack:#founders", "source_session": "…", "source_reference": "m1",
    "created_at": "…", "updated_at": "…", "resolved_at": null,
    "evidence": [{ "kind": "capture|update|confirm|resolution", "text": "I'll send Anu…", "by": "Aaditya", "channel": "…", "ref": "m1", "at": "…",
                   "trust": "team|external", "note": "rescheduled … | conflict X-1" }]
  }],
  // issue: title, description, stakeholder, priority, owner, next_action
  // decision: decision, context, participants, date
  "people": [{ "name": "Anu Sharma", "aliases": ["Anu"], "role": "investor", "organization": null, "notes": null }],
  "actions": [{ "id": "A-1", "kind": "send_message", "target": "Acme", "channel": "…", "body": "…", "item_id": "I-1",
                "status": "pending_approval|approved|executed|cancelled|stale", "idempotency_key": "…",
                "item_version": "<hash of status/owner/party/subject/deadline>", "approvals": [{ "by": "Aaditya", "at": "…" }],
                "proposed_by": "Meera", "approved_by": "Aaditya", "receipt": "…" }]
}
```

"Outstanding commitments involving a person" is computed (`relay people`, `list --person`),
not stored, so it never goes stale.

Ledgers written before these fields existed load unchanged: a missing `direction` is outbound,
missing `trust` is team, missing `conflicts` is none.

## Why these safeguards

| Failure mode | Guard | Source |
| --- | --- | --- |
| Acting on a plan derived from state that has since changed | approval bound to `item_version`; stale drafts never execute | arXiv 2609.03340 |
| Contradictions silently overwritten ("last writer wins") | conflicts recorded with both speakers; `settle` | arXiv 2606.24535 |
| Uncertain beliefs treated as facts | `tentative` status, excluded from open work until confirmed | arXiv 2607.23929 |
| Untrusted content steering real actions | evidence trust + two-person rule for high-risk drafts | arXiv 2608.10509 |

## Provenance

Every item keeps an append-only evidence list. Speaker and channel come from the skill,
or from `OPENCLAW_CHANNEL_CONTEXT`, which OpenClaw's exec tool sets for channel-origin runs.
`relay show <id>` answers "why does RELAY believe this?".

## Scheduling

- Morning brief: a normal OpenClaw automation (`openclaw automations create … --session isolated --announce`).
- Overdue nudges: heartbeat monitor scratch loaded from `workspace/HEARTBEAT.md`.

## Concepts adapted from prior work

From studying clawchief (reference only, see DEVELOPMENT_NOTES.md): keep one canonical
source of truth for live work; separate "what matters" (priority rules) from "what to do"
(act / draft-and-ask / escalate); keep scheduled prompts short and put the procedure in
skills; make ingestion idempotent with a processed-items record. RELAY implements these
independently, for a team instead of one principal, with a structured ledger instead of
Markdown task lists.
