---
name: relay-query
description: Answer "what's open?", "what did we promise X?", "what changed?" and similar questions from RELAY's shared ledger, with sources.
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# RELAY query

Engine: `node {baseDir}/../commitment-tracker/scripts/relay.mjs` (call it `relay` below).
Run the command on **every** question, even if you answered the same question a minute ago
in this conversation. Earlier answers are stale: teammates change the ledger from
conversations you cannot see. Never answer from chat memory.

| Question | Command |
| --- | --- |
| What are we on the hook for? / What's still open? | `relay list` |
| What did we promise Anu? / Anything with Acme? | `relay list --person "Anu"` (add `--status all` for history) |
| What did I promise this week? | `relay list --owner "<asker>" --since <monday ISO>` |
| What is overdue? | `relay list --overdue` |
| Due today? | `relay list --due-today` |
| What are we waiting on from customers? | `relay list --type issue` |
| Who owes us something? / What are we waiting on from others? | `relay list --waiting-on` |
| What do we owe people? | `relay list --we-owe` |
| Anything contradictory / unclear? | `relay list --conflicts` and `relay list --status tentative` |
| Which commitments have no owner? | `relay list --unowned` |
| What did the team decide about pricing? | `relay list --type decision --status all --text "pricing"` |
| What changed since yesterday? | `relay changes --since yesterday` |
| Why do you think that? / Where did that come from? | `relay show C-3` |
| Who is Anu? | `relay people` |

The asker's name is the message sender. "We" means the whole team.

## Answer format

- Lead with the count, then one line per item: who → whom, what, due, status, id.
- Add the source line ("said by <speaker> in <recorded channel>, <time>" — only what the ledger recorded) for each item or
  when asked. Quote evidence exactly; do not paraphrase it into something stronger.
- Inbound items read "(they owe us)": say who owes the team what, not the other way round.
- Items with a ⚠ conflict line: show both versions and who said each; never pick one.
- Evidence marked `[external]` came from outside the team — say so when you quote it.
- If nothing matches, say so plainly. Do not pad.
- Offer at most one next step (assign an owner, draft a follow-up).
- If a query mentions a person the ledger does not know, say that rather than guessing.

Teach aliases when the team uses nicknames:
`relay person --json '{"name":"Anu Sharma","aliases":["Anu"],"role":"investor","organization":"Seedfund"}'`
