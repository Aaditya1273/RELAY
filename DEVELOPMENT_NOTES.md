# Development notes

RELAY was independently implemented using publicly observable architectural concepts and
OpenClaw documentation; the original clawchief repository was used as a reference during
development.

## Provenance of this repository

- An earlier working copy of this repository contained files from
  [snarktank/clawchief](https://github.com/snarktank/clawchief), with `clawchief/` renamed to
  `relay/`, plus that author's personal priority data. No LICENSE file was observed in the
  clawchief repository on 2026-09-28, so that material was treated as not licensed for
  redistribution.
- On 2026-09-28 those files were removed before the first commit and never committed here.
  A private reference copy was kept outside this repository (not distributed) and flagged
  to the maintainer.
- Every file now in this repository was written for RELAY. None is a copy or renamed copy
  of a clawchief file.

## Ideas taken from the reference (concepts, not expression)

- A single canonical source of truth for live work, separate from chat memory.
- Separate policies for "what matters" and "what to do": act, draft-and-ask, escalate, ignore.
- Short scheduled prompts that delegate procedure to skills.
- Idempotent ingestion with a record of what has been processed.

## What is new in RELAY

- Team-first model (owners, counterparties, stakeholders) instead of one principal.
- Structured JSON ledger with dedupe, aliases, provenance and an approval/action queue.
- A deterministic engine with tests, instead of Markdown task files edited by the model.
- Built for OpenClaw 2026.8.1: automations CLI, heartbeat monitor scratch, multi-user
  sessions, `OPENCLAW_CHANNEL_CONTEXT`, Plow base-image constraints.
- No Google Workspace / gog dependency.

## Research behind the safeguards (added 2026-09-29)

These papers informed *design choices*; no text or code from them is included. Each ID was
checked against the arXiv API.

| Feature | Paper | Idea taken |
| --- | --- | --- |
| Two-way ledger | Smart To-Do: Automatic Generation of To-Do Items from Emails ([2005.06282](https://arxiv.org/abs/2005.06282)) | commitments hide in ordinary messages, including ones others make to you |
| Two-way ledger, nudges | AI-Powered Reminders for Collaborative Tasks ([2403.01365](https://arxiv.org/abs/2403.01365)) | reminders for shared work are about who is waiting on whom |
| Stale-draft guard | Fresh Memory, Stale Plans: Derivation Currency for Distributed LLM-Agent Memory ([2609.03340](https://arxiv.org/abs/2609.03340)) | an action must be checked against the current version of the state it was derived from |
| Conflict detection | Governed Shared Memory for Multi-Agent LLM Systems ([2606.24535](https://arxiv.org/abs/2606.24535)) | shared memory should record contradictions, not let the last writer win |
| Tentative queue | MemTX: Transactional Belief Commit for Stateful Agent Memory ([2607.23929](https://arxiv.org/abs/2607.23929)) | uncertain beliefs stay provisional until committed |
| Trust gate | MAP-Graph: Provenance-Aware Shared Memory for Multi-Agent Workflows ([2608.10509](https://arxiv.org/abs/2608.10509)) | where a fact came from decides how much it may drive action |

The implementation plan used for that change is in `docs/superpowers/plans/`.

## Open licensing questions for the maintainer

- None for files in this repository. If you want to reuse any specific clawchief wording,
  ask its author for a license first.
