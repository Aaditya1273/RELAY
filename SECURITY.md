# Security

RELAY reads team conversations and can, after approval, send messages. This page says
what it protects against, what it doesn't, and what it relies on OpenClaw for.

## Trust model

- **One agent = one trust domain.** Per OpenClaw's multi-user docs, anyone who can operate
  an agent can make it do anything that agent can do; session ownership, presence and
  drafts are coordination features, not security boundaries. RELAY adds no per-user
  isolation. The ledger is readable by every session of the agent, by design.
- Separate teams, clients or confidentiality levels → separate agents/workspaces.
- On the Plow base image, every identity admitted through Plow's proxy is an admin of the
  agent, and the owner's Mac (via Latch) is reachable by the agent. Only admit people who
  may use those resources.

## Controls in RELAY

| Risk | Control | Where |
| --- | --- | --- |
| Prompt injection via imported messages | Messages are data. Skills and AGENTS.md forbid following embedded instructions; the extractor flags common injection phrasing as `ignored` and records nothing | AGENTS.md, skills, `extract` (tested) |
| Fabricated promises / completions | Evidence text required to capture and to resolve; `update` cannot set `resolved`; low-confidence records are staged as **tentative** and kept out of open work until a teammate runs `confirm` (or `reject`) | engine (tested) |
| Acting on out-of-date information | Every draft is bound to a hash of its item (status, owner, party, subject, deadline). If the item changes before approval, the draft becomes **stale** and can never execute | engine (tested); [arXiv 2609.03340](https://arxiv.org/abs/2609.03340) |
| Contradictions silently overwritten | A different deadline or owner from another teammate is recorded as a **conflict** with both speakers; the current value is kept, and approvals on that item are blocked until someone runs `settle` | engine (tested); [arXiv 2606.24535](https://arxiv.org/abs/2606.24535) |
| Outside content steering real actions | Evidence is tagged `team` or `external`. A draft resting only on external content, or sent to a contact never mentioned in team messages, is **high risk** and needs two approvals from two different names | engine (tested); [arXiv 2608.10509](https://arxiv.org/abs/2608.10509) |
| Silent outbound actions | `propose` → `approve A-n --by <person>` → execute once → `done --receipt`; executed actions cannot be re-approved or cancelled; optional `RELAY_APPROVERS` allowlist | engine (tested), relay-followup |
| Duplicate sends | Idempotency key per (kind, target, body, item version); a second identical draft returns the existing one | engine (tested) |
| Secrets in memory | Common key formats (OpenAI-style `sk-`, GitHub, Slack, AWS, Google, PEM private keys) redacted before storage and in the audit log | engine (tested) |
| Concurrent writers clobbering state | Directory lock + write-to-temp-and-rename | engine (tested with 8 processes) |
| Unbounded storage of chat | Only the evidence sentence is stored, clipped to 500 chars | engine |
| Command injection through exec | Skills pass message text as a single argument (`--text "<message>"`) or JSON; they never build shell code from message content. Prefer OpenClaw exec allowlist mode for `node relay.mjs` | skills, INSTALL.md |

## What RELAY does not do

- It does not authenticate people. Speaker names come from the channel (`OPENCLAW_CHANNEL_CONTEXT`)
  or the model; a display name is not proof of identity. `RELAY_APPROVERS` matches names,
  so it is a guard against mistakes, not against an attacker who controls the channel.
- Team membership is a list of names (`RELAY_TEAM`), not verified identities. **If `RELAY_TEAM`
  is unset, every message counts as team content** unless the skill marks it `external`, so
  the trust gate only applies to content the model recognised as outside. Set it.
- The two-person rule requires two *different names*. Unless `RELAY_APPROVERS` is also set,
  it does not check that both approvers are teammates.
- It does not encrypt the ledger at rest. Protect the workspace like any OpenClaw workspace
  (private disk, private git remote if you back it up; never a public repo).
- Heuristic injection detection is a tripwire, not a guarantee. The real protection is that
  no consequential action happens without an explicit human approval.

## Operator checklist

- Keep the gateway on loopback or behind authenticated access; see <https://docs.openclaw.ai/gateway/security>.
- Run `openclaw security audit` after installing.
- Set `RELAY_TEAM` to your teammates' names (as they appear in chat), e.g. `RELAY_TEAM=Aaditya,Priya,Meera`.
- Set `RELAY_APPROVERS` if the agent can reach external customers; together with `RELAY_TEAM`
  this makes the two-person rule mean two named teammates.
- Exclude `relay-data/` and `memory/` from any public repository (`.gitignore` in this repo does).
- Review `relay actions --all` periodically.

## Reporting

Open a private security advisory on the GitHub repository.
