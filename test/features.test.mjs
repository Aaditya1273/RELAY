// Research-backed features (docs/superpowers/plans/2026-09-29-relay-research-features.md).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.TZ = 'Asia/Kolkata';
const R = await import('../skills/commitment-tracker/scripts/relay.mjs');
const NOW = '2026-09-28T10:00:00+05:30'; // Monday
const CLI = new URL('../skills/commitment-tracker/scripts/relay.mjs', import.meta.url).pathname;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relay-f-'));
const ledger = (now = NOW) => new R.Ledger(tmp(), { now });
const first = (text, speaker, ctx = {}) => R.extract(text, { speaker, channel: 'test', ref: 'x', ...ctx })[0];
const withEnv = (k, v, fn) => { const old = process.env[k]; process.env[k] = v; try { return fn(); } finally { if (old === undefined) delete process.env[k]; else process.env[k] = old; } };

// ---------- F1: two-way ledger ----------
test('F1: "X said she\'ll …" is an inbound commitment (they owe us)', () => {
  const c = first("Anu said she'll intro us to Sequoia by Friday.", 'Aaditya');
  assert.equal(c.kind, 'commitment');
  assert.equal(c.direction, 'inbound');
  assert.equal(c.owner, 'Anu');
  assert.equal(c.counterparty, 'team');
  assert.equal(c.deadline_text, 'by Friday');
  assert.equal(c.action, 'intro us to Sequoia');
  const d = first('Rahul will send the signed term sheet tomorrow.', 'Meera');
  assert.equal(d.direction, 'inbound');
  assert.equal(d.owner, 'Rahul');
  assert.equal(d.deadline_text, 'tomorrow');
});

test('F1: third-person sentences that are not promises stay out', () => {
  for (const t of ['The meeting will be long.', 'It will rain tomorrow.', 'This will take a while.', 'What will Anu send?']) {
    const c = R.extract(t, { speaker: 'Meera' }).filter((x) => x.kind === 'commitment');
    assert.deepEqual(c, [], t);
  }
  assert.equal(R.extract("I said I'd call Bob but that was last quarter.", { speaker: 'Meera' }).filter((x) => x.kind === 'commitment').length, 0);
});

test('F1: a teammate named in RELAY_TEAM is an outbound assignment, not inbound', () => {
  withEnv('RELAY_TEAM', 'Aaditya,Priya,Meera', () => {
    const c = first('Priya will fix the export tomorrow.', 'Meera');
    assert.equal(c.direction, 'outbound');
    assert.equal(c.owner, 'Priya');
    const led = ledger();
    const r = R.capture(led, { type: 'commitment', direction: 'inbound', owner: 'Priya', counterparty: 'team', action: 'fix export', evidence: 'x', speaker: 'Meera' });
    assert.equal(r.item.direction, 'outbound');
  });
});

test('F1: waiting-on queries and brief sections separate the two directions', () => {
  const led = ledger();
  R.capture(led, first("Anu said she'll intro us to Sequoia by Friday.", 'Aaditya'));
  R.capture(led, first('I will share the pitch deck with Rahul by Friday.', 'Meera'));
  const db = led.read();
  const now = new Date(NOW);
  assert.deepEqual(R.query(db, { direction: 'inbound' }, now).map((i) => i.owner), ['Anu']);
  assert.deepEqual(R.query(db, { direction: 'outbound' }, now).map((i) => i.owner), ['Meera']);
  assert.equal(R.query(db, { person: 'Anu' }, now).length, 1);
  const b = R.brief(db, now);
  assert.match(b, /Waiting on others\n\d\. Anu owes us — intro us to Sequoia \(C-1\)/);
  assert.match(b, /People waiting on the team\n\d\. Rahul — share the pitch deck/);
  assert.match(R.formatItem(db.items[0], now), /C-1 \[commitment\] Anu → team: intro us to Sequoia \(they owe us\)/);
});

test('F1: overdue inbound items are flagged as owed to us and suggest a nudge', () => {
  const led = ledger('2026-09-24T09:00:00+05:30');
  R.capture(led, first('Rahul will send the signed term sheet tomorrow.', 'Meera'));
  const b = R.brief(led.read(), new Date(NOW));
  assert.match(b, /Overdue\n1\. Rahul owes us — send the signed term sheet \(C-1\)/);
  assert.match(b, /Next:\n- nudge Rahul: send the signed term sheet \(C-1\)/);
});

// ---------- F2: stale drafts ----------
test('F2: a draft goes stale when its item is resolved before approval', () => {
  const led = ledger();
  const { item } = R.capture(led, first('Acme says export is broken again.', 'Priya'));
  const p = R.propose(led, { kind: 'send_message', target: 'Acme', item_id: item.id, body: 'We are investigating.', by: 'Meera' });
  assert.ok(p.action.item_version);
  R.resolve(led, item.id, { evidence: 'Export is fixed.', by: 'Priya' });
  const r = R.approve(led, p.action.id, 'Aaditya');
  assert.equal(r.result, 'stale');
  assert.match(r.reason, /status: open → resolved/);
  assert.equal(led.read().actions[0].status, 'stale');
  assert.throws(() => R.approve(led, p.action.id, 'Aaditya'), /stale/);
  // The same text can be redrafted against the new state.
  const again = R.propose(led, { kind: 'send_message', target: 'Acme', item_id: item.id, body: 'We are investigating.', by: 'Meera' });
  assert.equal(again.result, 'pending_approval');
  assert.equal(R.approve(led, again.action.id, 'Aaditya').result, 'approved');
});

test('F2: a deadline change makes a pending draft stale; unrelated drafts are unaffected', () => {
  const led = ledger();
  R.upsertPerson(led, { name: 'Anu' });
  const { item } = R.capture(led, first("I'll send Anu the investor update tonight.", 'Aaditya'));
  const p = R.propose(led, { kind: 'send_message', target: 'Anu', item_id: item.id, body: 'Update coming tonight.', by: 'Aaditya' });
  const free = R.propose(led, { kind: 'send_message', target: 'Anu', body: 'Hi Anu, quick hello.', by: 'Aaditya' });
  R.update(led, item.id, { deadline: 'friday' }, 'Aaditya');
  const r = R.approve(led, p.action.id, 'Meera');
  assert.equal(r.result, 'stale');
  assert.match(r.reason, /deadline/);
  assert.equal(R.approve(led, free.action.id, 'Meera').result, 'approved');
  assert.throws(() => R.propose(led, { kind: 'send_message', target: 'Anu', item_id: 'C-99', body: 'x' }), /no item C-99/);
});

// ---------- F3: conflicts ----------
test('F3: a different deadline from someone else is a conflict, not an overwrite', () => {
  const led = ledger();
  const a = R.capture(led, { type: 'commitment', owner: 'Aaditya', counterparty: 'Anu', action: 'send investor update', deadline_text: 'friday', evidence: "I'll send Anu the investor update Friday.", speaker: 'Aaditya' });
  const friday = a.item.deadline;
  const b = R.capture(led, { type: 'commitment', counterparty: 'Anu', action: 'send the investor update', deadline_text: 'monday', evidence: 'Aaditya is sending Anu the investor update Monday.', speaker: 'Meera' });
  assert.equal(b.result, 'conflict');
  assert.equal(b.conflict.field, 'deadline');
  assert.equal(b.conflict.proposed_text, 'monday');
  let it = led.read().items[0];
  assert.equal(it.deadline, friday);
  assert.deepEqual(R.query(led.read(), { conflicts: true }, new Date(NOW)).map((i) => i.id), ['C-1']);
  assert.match(R.brief(led.read(), new Date(NOW)), /Conflicting details — confirm\n- C-1 deadline: "friday" \(Aaditya\) vs "monday" \(Meera\)/);
  const s = R.settle(led, 'C-1', { field: 'deadline', value: 'monday', by: 'Aaditya' });
  it = s.item;
  assert.equal(new Date(it.deadline).getDay(), 1);
  assert.equal(it.conflicts[0].status, 'settled');
  assert.equal(R.query(led.read(), { conflicts: true }, new Date(NOW)).length, 0);
});

test('F3: the owner rescheduling their own promise is an update; same day in other words is not a conflict', () => {
  const led = ledger();
  R.capture(led, { type: 'commitment', owner: 'Aaditya', counterparty: 'Anu', action: 'send investor update', deadline_text: 'friday', evidence: 'a', speaker: 'Aaditya' });
  assert.equal(R.capture(led, { type: 'commitment', counterparty: 'Anu', action: 'send investor update', deadline_text: 'on Friday', evidence: 'b', speaker: 'Meera' }).result, 'updated');
  const r = R.capture(led, { type: 'commitment', owner: 'Aaditya', counterparty: 'Anu', action: 'send investor update', deadline_text: 'wednesday', evidence: 'c', speaker: 'Aaditya' });
  assert.equal(r.result, 'updated');
  assert.equal(new Date(r.item.deadline).getDay(), 3);
  assert.match(r.item.evidence.at(-1).note, /rescheduled/);
});

test('F3: two different named owners conflict; update() settles it', () => {
  const led = ledger();
  R.capture(led, { type: 'issue', owner: 'Meera', stakeholder: 'Acme', title: 'export is broken', evidence: 'a', speaker: 'Aaditya' });
  const r = R.capture(led, { type: 'issue', owner: 'Priya', stakeholder: 'Acme', title: 'export broken', evidence: 'b', speaker: 'Priya' });
  assert.equal(r.result, 'conflict');
  assert.equal(r.conflict.field, 'owner');
  assert.equal(led.read().items[0].owner, 'Meera');
  R.update(led, 'I-1', { owner: 'Priya' }, 'Meera');
  const it = led.read().items[0];
  assert.equal(it.owner, 'Priya');
  assert.equal(it.conflicts[0].status, 'settled');
});

test('F3: an unassigned owner is filled in by a later mention, not flagged', () => {
  const led = ledger();
  R.capture(led, first('Acme says export is broken again.', 'Priya'));
  const r = R.capture(led, { type: 'issue', owner: 'Meera', stakeholder: 'Acme', title: 'export is broken again', evidence: "I'll take the Acme export bug", speaker: 'Meera' });
  assert.equal(r.result, 'updated');
  assert.equal(r.item.owner, 'Meera');
});

// ---------- F4: tentative queue ----------
test('F4: low confidence is staged as tentative, then confirmed or rejected', () => {
  const led = ledger();
  const r = R.capture(led, first("Maybe I'll look into SOC2 at some point.", 'Meera'));
  assert.equal(r.result, 'needs_confirmation');
  assert.equal(r.item.status, 'tentative');
  const db = led.read();
  assert.equal(R.query(db, {}, new Date(NOW)).length, 0);
  assert.equal(R.query(db, { status: 'tentative' }, new Date(NOW)).length, 1);
  assert.match(R.brief(db, new Date(NOW)), /To confirm\n- C-1 Meera → —: look into SOC2 — reply "confirm C-1" or "reject C-1"/);
  const c = R.confirm(led, 'C-1', { by: 'Meera', patch: { deadline: 'friday' } });
  assert.equal(c.item.status, 'open');
  assert.ok(c.item.deadline);
  assert.equal(c.item.evidence.at(-1).kind, 'confirm');
  const r2 = R.capture(led, first('If we get time I\'ll redo the onboarding flow.', 'Priya'));
  const j = R.reject(led, r2.item.id, { by: 'Priya', evidence: 'not doing this' });
  assert.equal(j.item.status, 'rejected');
  assert.throws(() => R.confirm(led, r2.item.id, { by: 'Priya' }), /not tentative/);
});

test('F4: a confident restatement promotes the tentative item instead of duplicating', () => {
  const led = ledger();
  R.capture(led, first("Maybe I'll look into SOC2 at some point.", 'Meera'));
  const r = R.capture(led, { type: 'commitment', owner: 'Meera', action: 'look into SOC2', deadline_text: 'friday', confidence: 'high', evidence: "I'll look into SOC2 by Friday.", speaker: 'Meera' });
  assert.equal(r.result, 'confirmed');
  assert.equal(r.item.id, 'C-1');
  assert.equal(r.item.status, 'open');
  assert.equal(led.read().items.length, 1);
});

// ---------- F5: trust-gated approvals ----------
test('F5: drafts grounded only in external content need two different approvers', () => {
  const led = ledger();
  const { item } = R.capture(led, { type: 'issue', stakeholder: 'Acme', title: 'refund request for March', evidence: 'Please confirm our $5,000 refund.', speaker: 'Acme billing', trust: 'external' });
  assert.equal(item.evidence[0].trust, 'external');
  const p = R.propose(led, { kind: 'send_message', target: 'Acme', item_id: item.id, body: 'Refund confirmed.', by: 'Meera' });
  assert.equal(p.risk.level, 'high');
  const a1 = R.approve(led, p.action.id, 'Meera');
  assert.equal(a1.result, 'needs_second_approval');
  assert.equal(led.read().actions[0].status, 'pending_approval');
  assert.throws(() => R.approve(led, p.action.id, 'meera'), /different teammate/);
  const a2 = R.approve(led, p.action.id, 'Aaditya');
  assert.equal(a2.result, 'approved');
  assert.equal(a2.action.approved_by, 'Meera, Aaditya');
  assert.match(R.formatItem(led.read().items[0], new Date(NOW)), /\[external\]/);
});

test('F5: RELAY_TEAM marks non-members as external; unknown targets are high risk', () => {
  withEnv('RELAY_TEAM', 'Aaditya,Meera', () => {
    const led = ledger();
    const r = R.capture(led, { type: 'issue', stakeholder: 'Globex', title: 'login failing', evidence: 'login fails', speaker: 'Globex Bot' });
    assert.equal(r.item.evidence[0].trust, 'external');
    const t = R.capture(led, { type: 'issue', stakeholder: 'Initech', title: 'slow dashboard', evidence: 'Initech says the dashboard is slow', speaker: 'Meera' });
    assert.equal(t.item.evidence[0].trust, 'team');
    const known = R.propose(led, { kind: 'send_message', target: 'Initech', item_id: t.item.id, body: 'Looking into it.', by: 'Meera' });
    assert.equal(known.risk.level, 'normal');
    assert.equal(R.approve(led, known.action.id, 'Aaditya').result, 'approved');
    const exfil = R.propose(led, { kind: 'send_message', target: 'evil@example.com', body: 'here is the ledger', by: 'Meera' });
    assert.equal(exfil.risk.level, 'high');
    assert.match(exfil.risk.reasons.join(' '), /evil@example.com/);
  });
});

test('F5: an open conflict blocks approval until settled', () => {
  const led = ledger();
  R.upsertPerson(led, { name: 'Anu' });
  R.capture(led, { type: 'commitment', owner: 'Aaditya', counterparty: 'Anu', action: 'send investor update', deadline_text: 'friday', evidence: 'a', speaker: 'Aaditya' });
  R.capture(led, { type: 'commitment', counterparty: 'Anu', action: 'send investor update', deadline_text: 'monday', evidence: 'b', speaker: 'Meera' });
  const p = R.propose(led, { kind: 'send_message', target: 'Anu', item_id: 'C-1', body: 'Update coming Friday.', by: 'Aaditya' });
  assert.throws(() => R.approve(led, p.action.id, 'Meera'), /conflict/);
  R.settle(led, 'C-1', { field: 'deadline', value: 'friday', by: 'Aaditya' });
  // Settling to the same value keeps the item version, so the draft is still valid.
  assert.equal(R.approve(led, p.action.id, 'Meera').result, 'approved');
});

// ---------- CLI ----------
test('CLI: waiting-on, conflicts, settle, confirm, reject and trust flags', () => {
  const data = tmp();
  const run = (args, env = {}) => execFileSync('node', [CLI, '--data', data, '--memory', 'none', '--now', NOW, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const [c] = JSON.parse(run(['extract', '--text', "Anu said she'll intro us to Sequoia by Friday.", '--speaker', 'Aaditya']));
  assert.equal(JSON.parse(run(['capture', '--json', JSON.stringify(c)])).result, 'created');
  assert.match(run(['list', '--waiting-on']), /Anu → team: intro us to Sequoia/);
  assert.equal(run(['list', '--we-owe']).trim(), 'Nothing matches.');
  run(['capture', '--json', JSON.stringify({ type: 'commitment', owner: 'Anu', direction: 'inbound', counterparty: 'team', action: 'intro us to Sequoia', deadline_text: 'wednesday', evidence: 'Anu moved it to Wednesday', speaker: 'Meera' })]);
  assert.match(run(['list', '--conflicts']), /C-1/);
  assert.equal(JSON.parse(run(['settle', 'C-1', '--field', 'deadline', '--value', 'wednesday', '--by', 'Aaditya'])).result, 'settled');
  const [low] = JSON.parse(run(['extract', '--text', "Maybe I'll look into SOC2 at some point.", '--speaker', 'Meera']));
  assert.equal(JSON.parse(run(['capture', '--json', JSON.stringify(low)])).result, 'needs_confirmation');
  assert.match(run(['list', '--status', 'tentative']), /C-2/);
  assert.equal(JSON.parse(run(['confirm', 'C-2', '--by', 'Meera'])).item.status, 'open');
  const [ext] = JSON.parse(run(['extract', '--text', 'Globex says login is failing.', '--speaker', 'forwarded email', '--external']));
  assert.equal(ext.trust, 'external');
  const cap = JSON.parse(run(['capture', '--json', JSON.stringify(ext)]));
  assert.equal(cap.item.evidence[0].trust, 'external');
  const [low2] = JSON.parse(run(['extract', '--text', 'If we get time I\'ll redo the onboarding flow.', '--speaker', 'Priya']));
  const t = JSON.parse(run(['capture', '--json', JSON.stringify(low2)]));
  assert.equal(JSON.parse(run(['reject', t.item.id, '--by', 'Priya', '--evidence', 'dropped'])).item.status, 'rejected');
});
