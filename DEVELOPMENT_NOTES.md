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

## Open licensing questions for the maintainer

- None for files in this repository. If you want to reuse any specific clawchief wording,
  ask its author for a license first.
