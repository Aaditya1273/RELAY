# RELAY research-backed features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five engine-level features that separate RELAY from meeting-notes trackers: two-way
("waiting on") commitments, stale-draft invalidation, conflict detection, a tentative/confirm queue,
and trust-gated approvals with a two-person rule.

**Architecture:** Everything lives in the existing zero-dependency engine
`skills/commitment-tracker/scripts/relay.mjs` (same file, same patterns: `led.tx()` for writes,
`UserError` for rejected input, JSON output from the CLI). Skills/AGENTS.md teach the model the new
commands. Old ledgers keep working: every new field has a default when missing.

**Tech Stack:** Node ≥ 18, `node:test`, no dependencies.

**Spec:** the five research-backed features agreed in conversation on 2026-09-29:

| # | Feature | Research basis |
|---|---|---|
| F1 | Two-way ledger: what others owe us (`direction: inbound`) as well as what we owe | Smart To-Do, arXiv 2005.06282; AI-Powered Reminders for Collaborative Tasks, arXiv 2403.01365 |
| F2 | Stale-draft invalidation: an approval is bound to the item version it was drafted against | Fresh Memory, Stale Plans, arXiv 2609.03340 |
| F3 | Contradiction detection: conflicting deadline/owner mentions are flagged, not overwritten | Governed Shared Memory, arXiv 2606.24535 |
| F4 | Tentative commit: low-confidence captures are staged for confirmation instead of dropped | MemTX, arXiv 2607.23929 |
| F5 | Provenance-trust gate: actions grounded only in external content need two teammate approvals | MAP-Graph, arXiv 2608.10509 |

## Global Constraints

- Zero runtime dependencies; Node 18+.
- Never invent data: unknown values stay `null`.
- Every state change keeps evidence and writes one audit line via `led.log`.
- Existing 17 tests must keep passing (test G is intentionally updated for F4).
- A ledger written by the previous version must load and behave the same.

## Review Focus

1. Legacy ledger items with no `direction`, `trust`, `conflicts`, `version` fields → treated as outbound, team-trusted, no conflicts.
2. A draft with no `item_id` (free-standing message) → F2 has nothing to check and must not block it.
3. The same person repeating a promise with the *same* deadline in different words → no conflict.
4. A tentative item re-stated with high confidence → promoted, not duplicated.
5. The proposer approving their own high-risk draft → counts as one approval only; the second must be a different person.

---

### Task 1: F1 — two-way commitments ("waiting on")

**Files:** Modify `relay.mjs` (extract, capture, query, brief, describe, CLI list flags); Test `test/relay.test.mjs`; fixtures.

**Interfaces — produces:**
- item field `direction: 'outbound' | 'inbound'` (commitments only; default `outbound`).
- `extract()` emits `{kind:'commitment', direction:'inbound', owner:<Name>, counterparty:'team'}` for
  `"<Name> said/promised/will/'ll <do X>"`, `"<Name> (said|promised) (she|he|they)('ll| will| would|'d) …"`.
- `query(db, { direction: 'inbound' | 'outbound' })`; CLI `list --waiting-on` (= inbound) and `--we-owe` (= outbound).
- `brief()` sections: "People waiting on the team" (outbound only) and "Waiting on others" (inbound, with overdue ones listed under Overdue labeled `(they owe us)`).

- [ ] Test: `"Anu said she'll intro us to Sequoia by Friday."` (speaker Aaditya) → commitment, inbound, owner Anu, counterparty team, deadline_text `by Friday`.
- [ ] Test: `"Rahul will send the signed term sheet tomorrow."` → inbound, owner Rahul.
- [ ] Test: `"I said I'd call Bob"` stays negative (existing fixture).
- [ ] Test: query direction filters; brief contains "Waiting on others" with the inbound item and it is NOT under "People waiting on the team".
- [ ] Implement, run `npm test`, all pass.

### Task 2: F2 — stale-draft invalidation

**Interfaces — produces:**
- `itemVersion(item) → string` (sha256 of status, owner, counterparty/stakeholder, subject, deadline; 12 hex chars).
- `propose()` stores `item_version` when `item_id` is given; rejects unknown `item_id` (UserError) and non-open items.
- `approve()` returns `{result:'stale', action, reason}` and sets `action.status='stale'` when the linked item is gone, no longer open, or its version changed.

- [ ] Test: propose for I-1 → resolve I-1 → approve → `stale`, status persisted, re-approve throws.
- [ ] Test: propose for C-1 → update deadline → approve → `stale` with reason mentioning the change.
- [ ] Test: propose without item_id still approves (Review Focus 2).
- [ ] Implement; `npm test`.

### Task 3: F3 — conflict detection

**Interfaces — produces:**
- item field `conflicts: [{ id:'X-n', field:'deadline'|'owner', current, proposed, proposed_text, by, evidence, at, status:'open'|'settled' }]`.
- `capture()` merge path: differing deadline (different local day) or differing named owner (not `team`/`unassigned`) → records conflict, keeps current value, returns `{result:'conflict', item, conflict}`.
- `settle(led, id, { field, value, by })` → applies value, marks open conflicts on that field settled, adds evidence.
- `update()` of a field settles open conflicts on it.
- `query(db, { conflicts: true })`; CLI `list --conflicts`, `settle ID --field F --value V --by S`.
- brief section "Conflicting details — confirm" listing each open conflict.

- [ ] Test: "friday" then "monday" from someone else → conflict, deadline unchanged; settle to monday → deadline Monday, conflict settled.
- [ ] Test: same deadline phrased differently ("by Friday"/"on Friday") → `updated`, no conflict (Review Focus 3).
- [ ] Test: owner Meera vs owner Priya → owner conflict.
- [ ] Implement; `npm test`.

### Task 4: F4 — tentative queue

**Interfaces — produces:**
- `capture()` with `confidence:'low'` creates item with `status:'tentative'`, returns `{result:'needs_confirmation', item, message}`.
- Tentative items participate in dedupe; a non-low re-mention promotes them to `open` (`result:'confirmed'`).
- `confirm(led, id, { by, patch })` → `open`; `reject(led, id, { by, evidence })` → `rejected`.
- Default `list` excludes tentative; `list --status tentative`; brief section "To confirm".

- [ ] Update test G: low-confidence → `needs_confirmation`, 0 open, 2 tentative.
- [ ] Test: confirm with patch sets owner; reject hides it; high-confidence restatement promotes (Review Focus 4).
- [ ] Implement; `npm test`.

### Task 5: F5 — trust-gated approvals (two-person rule)

**Interfaces — produces:**
- evidence field `trust: 'team' | 'external'`. Set from input `trust`, or `external` when `RELAY_TEAM` is set and the speaker is not in it. Default `team`.
- `actionRisk(db, action) → { level:'normal'|'high', reasons:[] }`: high when linked item has no team-trusted evidence, target is not a party of any team-trusted evidence/people entry, or the item has an open conflict.
- `approve()` on high risk requires 2 distinct approvers (`action.approvals` list); first approval returns `{result:'needs_second_approval'}`; an open conflict blocks approval (`UserError`).
- `formatItem` marks external sources `(external)`.

- [ ] Test: item captured with `trust:'external'` → draft → approve by A → `needs_second_approval`; approve again by A → throws; by B → `approved`.
- [ ] Test: RELAY_TEAM=Aaditya,Meera and speaker "Acme Bot" → evidence trust external.
- [ ] Test: normal team item → single approval (existing M tests unchanged).
- [ ] Implement; `npm test`.

### Task 6: Skills, prompt, docs, demo

- [ ] commitment-tracker SKILL: inbound commitments, `trust`, conflict and tentative results.
- [ ] relay-query SKILL: `--waiting-on`, `--we-owe`, `--conflicts`, `--status tentative`.
- [ ] relay-followup SKILL: stale / needs_second_approval / nudges for inbound items.
- [ ] relay-brief SKILL: new sections. AGENTS.md routing for confirm/reject/settle.
- [ ] README/ARCHITECTURE/HACKATHON: feature list with research citations; README test count.
- [ ] `scripts/demo.sh`: add inbound, conflict, stale-draft beats. `npm test` + `npm run demo` green.
