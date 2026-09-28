# MEMORY (RELAY policy)

OpenClaw loads MEMORY.md only in the main private session, not in group conversations.
So RELAY keeps team state somewhere every conversation can reach:

| What | Where | Why |
| --- | --- | --- |
| Commitments, issues, decisions, people, drafts | `relay-data/ledger.json` via the engine | shared by all sessions; structured; deduplicated |
| Audit trail of changes | `memory/YYYY-MM-DD.md` (engine appends) | searchable by OpenClaw memory tools; human-readable |
| Stable preferences of the owner | this file | private session only |

Rules:
- Do not copy whole conversations here. Record the extracted item with its evidence line.
- Do not record credentials, tokens or personal data that is not needed to close a loop.
- When a fact here conflicts with the ledger, the ledger wins for work state.

## Owner preferences
<!-- e.g. "Brief at 09:00 IST in #founders. Nudge owners in DM, not in the group." -->
