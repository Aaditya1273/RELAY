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
| Fabricated promises / completions | Evidence text required to capture and to resolve; `update` cannot set `resolved`; low-confidence records refused → ask a person | engine (tested) |
| Silent outbound actions | `propose` → `approve A-n --by <person>` → execute once → `done --receipt`; executed actions cannot be re-approved or cancelled; optional `RELAY_APPROVERS` allowlist | engine (tested), relay-followup |
| Duplicate sends | Idempotency key per (kind, target, body); a second identical draft returns the existing one | engine (tested) |
| Secrets in memory | Common key formats (OpenAI-style `sk-`, GitHub, Slack, AWS, Google, PEM private keys) redacted before storage and in the audit log | engine (tested) |
| Concurrent writers clobbering state | Directory lock + write-to-temp-and-rename | engine (tested with 8 processes) |
| Unbounded storage of chat | Only the evidence sentence is stored, clipped to 500 chars | engine |
| Command injection through exec | Skills pass message text as a single argument (`--text "<message>"`) or JSON; they never build shell code from message content. Prefer OpenClaw exec allowlist mode for `node relay.mjs` | skills, INSTALL.md |

## What RELAY does not do

- It does not authenticate people. Speaker names come from the channel (`OPENCLAW_CHANNEL_CONTEXT`)
  or the model; a display name is not proof of identity. `RELAY_APPROVERS` matches names,
  so it is a guard against mistakes, not against an attacker who controls the channel.
- It does not encrypt the ledger at rest. Protect the workspace like any OpenClaw workspace
  (private disk, private git remote if you back it up; never a public repo).
- Heuristic injection detection is a tripwire, not a guarantee. The real protection is that
  no consequential action happens without an explicit human approval.

## Operator checklist

- Keep the gateway on loopback or behind authenticated access; see <https://docs.openclaw.ai/gateway/security>.
- Run `openclaw security audit` after installing.
- Set `RELAY_APPROVERS` if the agent can reach external customers.
- Exclude `relay-data/` and `memory/` from any public repository (`.gitignore` in this repo does).
- Review `relay actions --all` periodically.

## Reporting

Open a private security advisory on the GitHub repository.
