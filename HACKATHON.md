# RELAY — AI Worth Using × OpenClaw 2.0 Hackathon

**Project:** RELAY
**One-liner:** The AI Chief of Staff that remembers every commitment your team makes.
**Tagline:** The First Hire Who Never Forgets.
**License:** MIT (RELAY-authored material; see THIRD_PARTY_NOTICES.md)
**Runtime:** OpenClaw 2026.8.1+ · Node 18+ · no other dependencies

## What it is

Conversation-native operational memory for 2–10 person teams. RELAY captures promises,
customer issues and decisions from the team's chats into one shared ledger with sources,
answers "what's open / what did we promise X", posts a morning brief of overdue and due
items, and drafts follow-ups that are sent only after a teammate approves.

## Why it needs OpenClaw 2.0

- Several people operate one agent (multi-user sessions); RELAY is useless for one person
  alone — context loss needs two or more.
- Automations run the daily brief; the message tool sends approved follow-ups.
- Skills + workspace files are the whole product: no fork, no extra service.

## 60-second demo

| | |
| --- | --- |
| 0–10s | User A (Slack): "I'll send Anu the investor update tonight." |
| 10–20s | User B (WhatsApp group): "Acme says export is broken again." |
| 20–35s | User C (third chat): "What are we on the hook for?" |
| 35–48s | RELAY lists both with owners, due labels and the exact source messages; A says "I sent Anu the update" and it drops off |
| 48–60s | "Draft a follow-up to Acme" → draft A-1 → "approve A-1" → sent once via the configured channel, receipt shown (or an honest "not sent: no channel configured") |

Proves: real work · multiplayer · persistent memory · cross-context recall · action · safety.

## What sets RELAY apart

Similar listings turn one meeting's notes into to-dos. RELAY is a team's shared promise ledger
across chats, and it is safe to act on:

- **Both directions:** tracks what investors, customers and candidates promised *us*, and drafts nudges when they are late.
- **Stale-draft guard:** an approved follow-up can't go out if the item changed after it was drafted.
- **Conflict detection:** two teammates, two different deadlines → RELAY asks instead of picking one.
- **Tentative queue:** "maybe I'll…" is held for confirmation, not dropped and not counted.
- **Two-person rule:** drafts that rest on outside content (forwarded email, customer text) need two teammates to approve.

Each maps to a 2025–2026 agent-memory paper (README → "What makes it different").
Full script and expected output: DEMO.md. Offline rehearsal: `npm run demo`.

## Evidence we can show today

- `npm test` → 34 passing tests (extraction incl. negatives, deadlines, dedupe, aliases,
  resolution, overdue, provenance, injection, secret redaction, approval gate, concurrent writers, E2E CLI scenario,
  two-way ledger, stale drafts, conflicts, tentative queue, trust-gated two-person approval).
- `npm run demo` → the demo scenario end to end on the real engine.
- Live OpenClaw 2026.9.6 + Gemini run of the scenario across three sessions, the morning-brief
  automation, the approval gate and a prompt-injection attempt: [VERIFICATION.md](VERIFICATION.md).

Not claimed: users, installs, token usage, success rates, testimonials, certifications.

## Published

| | |
| --- | --- |
| Agent Index | <https://aiworthusing.com/agent-index/relay> (agent id `relay`) |
| Repository | <https://github.com/Aaditya1273/RELAY> (MIT) |
| Image | `ghcr.io/aaditya1273/relay@sha256:a221370e977ba49da2cb00dced21995007c124dae8630e73ef3c356c0eb3d524` (public) |
| Plow cloud | deployed with `plow-agents deploy <image@digest> --line ln_p2` |
| Version note | that image is commit `4226004`. The research-backed safeguards (commit `2484e19`) are in the repo and tests, not yet in the published image: rebuild, `plow-agents image push ghcr.io/aaditya1273/relay:v2`, redeploy |

## Agent Index publishing checklist

From <https://aiworthusing.com/agent-index/publish> and the Plow base README
(<https://github.com/plow-pbc/plow-openclaw-agent>), as read on 2026-09-28.
Prize eligibility there: **MIT licensed, reporting usage, and verified** (verification via their Discord).

Path A — Plow base image (recommended; usage reporting is built in):

1. Install the `plow-agents` CLI: <https://github.com/plow-pbc/plow-agents>
2. `plow-agents login` and `plow-agents lines` (pick a line; note its uid)
3. The `Dockerfile` defaults to the base built from plow-openclaw-agent commit `e0217de`
   (main on 2026-09-28). Before publishing, also pin its digest (`…:base-<sha>@sha256:<digest>`).
4. Build from the repo root: `plow-agents image build ghcr.io/<you>/relay:v1`
5. Run locally first (uses `compose.yml`): `plow-agents deploy --local --line <line>`;
   text the line "hello", then walk through DEMO.md.
6. The Dockerfile sets `AGENT_ID=relay`; the base image registers the listing and reports usage every five minutes when `AGENT_ID` is set. Change the slug if `relay` is taken.
7. `plow-agents image push ghcr.io/<you>/relay:v1` and `plow-agents profile --show`
8. Post uid, slug and the pushed image reference in the AI Worth Using Discord to get verified and 1-click deploy enabled.
9. Updates: `plow-agents image push ghcr.io/<you>/relay:v2 --promote relay`

Path B — existing OpenClaw install: add `agent_index_client.py`
(<https://github.com/plow-pbc/agent-index-client>) on a five-minute schedule, check with
`--dry-run`, then `--register --agent relay --name RELAY --blurb '…'`. That client's
out-of-the-box readers are Hermes, Claude Code and Codex; for OpenClaw you would supply a
usage function. **Not done in this repo.**

Pre-submission checks:
- [ ] `npm test` green
- [ ] LICENSE present; THIRD_PARTY_NOTICES.md reviewed
- [ ] no secrets: `git grep -nE "sk-|ghp_|xox[abprs]-|AKIA|PRIVATE KEY"` only matches test fixtures/docs
- [ ] live demo recorded on a real gateway (not the offline rehearsal)
- [ ] listing blurb matches what RELAY actually does

## Pitch notes by track (only what is true)

- **Multiplayer:** the product is a shared ledger across people and channels; one person alone gets little value.
- **Plow:** runs on the Plow base image; phone-line groups and email threads become RELAY inputs. Latch is used only if the owner connects it; RELAY does not ship Mac automations.
- **SDR / recruiting / investor relations:** the same ledger tracks leads, candidates and investor promises mentioned in any chat. RELAY is not an outreach tool.
