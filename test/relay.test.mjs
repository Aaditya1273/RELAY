// Run: npm test  (node --test test/*.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

process.env.TZ = 'Asia/Kolkata';
const R = await import('../skills/commitment-tracker/scripts/relay.mjs');
const F = JSON.parse(fs.readFileSync(new URL('./fixtures/messages.json', import.meta.url)));
const NOW = '2026-09-28T10:00:00+05:30';
const CLI = new URL('../skills/commitment-tracker/scripts/relay.mjs', import.meta.url).pathname;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
const ledger = (now = NOW, memoryDir = null) => new R.Ledger(tmp(), { now, memoryDir });
const first = (text, speaker) => R.extract(text, { speaker, channel: 'test', ref: 'x' })[0];

test('A-F: positive fixtures extract the expected kind and fields', () => {
  for (const f of F.positive) {
    const c = first(f.text, f.speaker);
    assert.ok(c, `no candidate for: ${f.text}`);
    for (const [k, v] of Object.entries(f.expect)) assert.equal(c[k], v, `${f.text} → ${k}`);
  }
});

test('negative fixtures produce no commitments/issues/decisions', () => {
  for (const f of F.negative) {
    const c = R.extract(f.text, { speaker: 'Meera' }).filter((x) => ['commitment', 'issue', 'decision'].includes(x.kind));
    assert.deepEqual(c, [], `${f.text} (${f.why})`);
  }
});

test('G: ambiguous (hedged) promises are low confidence and capture refuses them', () => {
  const led = ledger();
  for (const f of F.low_confidence) {
    const c = first(f.text, 'Meera');
    assert.equal(c.confidence, 'low', f.text);
    const r = R.capture(led, { ...c });
    assert.equal(r.result, 'needs_clarification');
  }
  assert.equal(led.read().items.length, 0);
});

test('queries are recognised as queries, not new commitments', () => {
  for (const q of F.queries) assert.equal(first(q, 'Priya').kind, 'query', q);
});

test('B: deadline resolution is relative to now and never guessed', () => {
  const now = new Date(NOW); // Monday
  const tonight = new Date(R.parseDeadline('tonight', now));
  assert.equal(tonight.getDate(), 28);
  assert.equal(tonight.getHours(), 23);
  assert.equal(new Date(R.parseDeadline('tomorrow', now)).getDate(), 29);
  assert.equal(new Date(R.parseDeadline('by Friday', now)).getDate(), 2);
  assert.equal(new Date(R.parseDeadline('2026-10-05', now)).getDate(), 5);
  assert.equal(R.parseDeadline('soon', now), null);
  assert.equal(R.parseDeadline('next quarter', now), null);
});

test('H: duplicate prevention — same message re-ingested and repeat mentions', () => {
  const led = ledger();
  const c = { ...first("I'll send Anu the investor update tonight.", 'Aaditya'), source_reference: 'm1' };
  assert.equal(R.capture(led, c).result, 'created');
  assert.equal(R.capture(led, c).result, 'duplicate');
  const again = { ...first('I will send the investor update to Anu tonight', 'Aaditya'), source_reference: 'm7' };
  assert.equal(R.capture(led, again).result, 'updated');
  const db = led.read();
  assert.equal(db.items.length, 1);
  assert.equal(db.items[0].evidence.length, 2);
});

test('H: similar-but-different commitments are NOT merged', () => {
  const led = ledger();
  R.capture(led, { type: 'commitment', action: 'send investor update', evidence: 'a', speaker: 'A' });
  assert.equal(R.capture(led, { type: 'commitment', action: 'send board update', evidence: 'b', speaker: 'A' }).result, 'created');
  assert.equal(R.capture(led, { type: 'commitment', action: 'send investor update', counterparty: 'Anu', evidence: 'c' }).result, 'updated');
});

test('H: aliases match the same person for dedupe and queries', () => {
  const led = ledger();
  R.upsertPerson(led, { name: 'Anu Sharma', aliases: ['Anu'], role: 'investor' });
  R.capture(led, { type: 'commitment', action: 'send investor update', counterparty: 'Anu', evidence: 'x', speaker: 'Aaditya' });
  assert.equal(R.query(led.read(), { person: 'Anu Sharma' }).length, 1);
});

test('I: resolution requires evidence and closes the item', () => {
  const led = ledger();
  const { item } = R.capture(led, first("I'll send Anu the investor update tonight.", 'Aaditya'));
  assert.throws(() => R.resolve(led, item.id, {}), /evidence/);
  assert.throws(() => R.update(led, item.id, { status: 'resolved' }), /resolve/);
  const r = R.resolve(led, item.id, { evidence: 'I sent Anu the update.', by: 'Aaditya' });
  assert.equal(r.item.status, 'resolved');
  assert.equal(R.resolve(led, item.id, { evidence: 'again' }).result, 'unchanged');
  assert.equal(R.query(led.read(), {}).length, 0);
});

test('J: overdue and due-today detection', () => {
  const led = ledger('2026-09-26T09:00:00+05:30');
  R.capture(led, first('I will send Kiran the contract today.', 'Meera')); // due Sep 26
  const led2 = new R.Ledger(led.dir, { now: NOW });
  R.capture(led2, first("I'll send Anu the investor update tonight.", 'Aaditya')); // due Sep 28
  const db = led2.read();
  const now = new Date(NOW);
  assert.deepEqual(R.query(db, { overdue: true }, now).map((i) => i.id), ['C-1']);
  assert.deepEqual(R.query(db, { dueToday: true }, now).map((i) => i.id), ['C-2']);
  const b = R.brief(db, now);
  assert.match(b, /Overdue[\s\S]*Kiran[\s\S]*overdue by 2 days/);
  assert.match(b, /Due today[\s\S]*Anu/);
});

test('K: provenance is retained and shown', () => {
  const led = ledger();
  const { item } = R.capture(led, first("I'll send Anu the investor update tonight.", 'Aaditya'));
  assert.equal(item.evidence[0].text, "I'll send Anu the investor update tonight.");
  assert.equal(item.evidence[0].by, 'Aaditya');
  assert.equal(item.source_channel, 'test');
  assert.match(R.formatItem(item, new Date(NOW)), /Source: "I'll send Anu.*Aaditya, test #x/);
  assert.throws(() => R.capture(led, { type: 'commitment', action: 'x' }), /evidence/);
});

test('L: prompt injection is flagged and never becomes state; secrets are redacted', () => {
  for (const t of F.injection) {
    const c = R.extract(t, {});
    assert.ok(c.every((x) => x.kind === 'ignored'), t);
  }
  const led = ledger();
  const { item } = R.capture(led, { type: 'commitment', action: 'rotate key sk-abcdefghijklmnopqrstuv', evidence: 'use sk-abcdefghijklmnopqrstuv please', speaker: 'Meera' });
  assert.doesNotMatch(JSON.stringify(led.read()), /sk-abcdef/);
  assert.match(item.action, /\[REDACTED\]/);
});

test('M: outbound actions are approval-gated and idempotent', () => {
  const led = ledger();
  const draft = { kind: 'send_message', target: 'Acme', channel: 'whatsapp', body: 'Hi Acme — we are on the export bug.', by: 'Meera' };
  const p = R.propose(led, draft);
  assert.equal(p.action.status, 'pending_approval');
  assert.equal(R.propose(led, draft).result, 'duplicate');
  assert.throws(() => R.finishAction(led, p.action.id, { receipt: 'msg-1' }), /only approved/);
  assert.throws(() => R.approve(led, p.action.id), /approver/);
  assert.equal(R.approve(led, p.action.id, 'Aaditya').action.status, 'approved');
  assert.throws(() => R.approve(led, p.action.id, 'Aaditya'), /will not be executed again/);
  assert.throws(() => R.finishAction(led, p.action.id, {}), /receipt/);
  assert.equal(R.finishAction(led, p.action.id, { receipt: 'msg-1' }).action.status, 'executed');
  assert.throws(() => R.finishAction(led, p.action.id, { cancel: true }), /already executed/);
});

test('M: RELAY_APPROVERS restricts who can approve', () => {
  const led = ledger();
  const p = R.propose(led, { kind: 'send_message', target: 'Anu', body: 'update' });
  process.env.RELAY_APPROVERS = 'Aaditya';
  try {
    assert.throws(() => R.approve(led, p.action.id, 'Mallory'), /not in RELAY_APPROVERS/);
    assert.equal(R.approve(led, p.action.id, 'aaditya').result, 'approved');
  } finally { delete process.env.RELAY_APPROVERS; }
});

test('daily memory log mirrors state changes', () => {
  const mem = tmp();
  const led = ledger(NOW, mem);
  R.capture(led, first("I'll send Anu the investor update tonight.", 'Aaditya'));
  const log = fs.readFileSync(path.join(mem, '2026-09-28.md'), 'utf8');
  assert.match(log, /RELAY captured C-1 \[commitment\] Aaditya → Anu/);
});

// Section 19 scenario, end to end through the CLI, with two different people in two
// different channels writing to and reading from the same shared ledger.
test('E2E multiplayer scenario via CLI', () => {
  const data = tmp();
  const run = (args, env = {}) => execFileSync('node', [CLI, '--data', data, '--memory', 'none', '--now', NOW, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const cap = (text, speaker, channel, ref) => {
    const [c] = JSON.parse(run(['extract', '--text', text, '--speaker', speaker, '--channel', channel, '--ref', ref]));
    return JSON.parse(run(['capture', '--json', JSON.stringify(c)]));
  };
  assert.equal(cap("I'll send Anu the investor update tonight.", 'Aaditya', 'slack:#founders', 'm1').result, 'created');
  assert.equal(cap('Acme says export is broken again.', 'Priya', 'whatsapp:support', 'm2').result, 'created');
  const q = JSON.parse(run(['extract', '--text', "Can someone check what we're still on the hook for?", '--speaker', 'Meera']));
  assert.equal(q[0].kind, 'query');
  const open = run(['list']);
  assert.match(open, /C-1 \[commitment\] Aaditya → Anu: send Anu the investor update/);
  assert.match(open, /I-1 \[issue\] Acme: export is broken again/);
  assert.match(open, /slack:#founders #m1/);
  assert.match(run(['list', '--person', 'Anu']), /C-1/);
  // A channel-origin run: identity comes from OPENCLAW_CHANNEL_CONTEXT.
  run(['resolve', 'C-1', '--evidence', 'I sent Anu the update.'], { OPENCLAW_CHANNEL_CONTEXT: JSON.stringify({ senderName: 'Aaditya', channel: 'slack:#founders' }) });
  const after = run(['list']);
  assert.doesNotMatch(after, /C-1/);
  assert.match(after, /I-1/);
  const shown = run(['show', 'C-1']);
  assert.match(shown, /resolution .* Aaditya \(slack:#founders\): "I sent Anu the update\."/);
  const p = JSON.parse(run(['propose', '--json', JSON.stringify({ kind: 'send_message', target: 'Acme', channel: 'whatsapp:support', body: 'Hi — we reproduced the export bug and are on it.', item_id: 'I-1', by: 'Meera' })]));
  assert.equal(p.action.status, 'pending_approval');
  const bad = spawnSync('node', [CLI, '--data', data, 'done', p.action.id, '--receipt', 'x'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.equal(JSON.parse(run(['approve', p.action.id, '--by', 'Aaditya'])).result, 'approved');
  assert.match(run(['brief']), /Acme — export is broken again \(I-1\)/);
});

test('concurrent writers from separate processes do not lose updates', async () => {
  const data = tmp();
  const { spawn } = await import('node:child_process');
  const procs = Array.from({ length: 8 }, (_, i) => new Promise((res, rej) => {
    const p = spawn('node', [CLI, '--data', data, '--memory', 'none', 'capture', '--json', JSON.stringify({ type: 'commitment', action: ['renew domain', 'pay AWS invoice', 'hire designer', 'fix onboarding email', 'book offsite venue', 'draft SOC2 policy', 'migrate postgres', 'update pricing page'][i], evidence: `m${i}`, source_reference: `r${i}` })]);
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error('exit ' + code))));
  }));
  await Promise.all(procs);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'ledger.json'))).items.length, 8);
});
