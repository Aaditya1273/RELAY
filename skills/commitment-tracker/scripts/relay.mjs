#!/usr/bin/env node
// RELAY engine: shared operational memory for a team's commitments, issues and decisions.
// Zero dependencies. Node >= 18. State lives in one JSON ledger shared by every session
// of the agent; that shared file is what makes RELAY multiplayer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

if (process.env.RELAY_TZ) process.env.TZ = process.env.RELAY_TZ;

// ---------- text helpers ----------
const SECRET_RE = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g;
export const redact = (s) => (typeof s === 'string' ? s.replace(SECRET_RE, '[REDACTED]') : s);
const clip = (s, n = 500) => (s && s.length > n ? s.slice(0, n) + '…' : s);
const clean = (s) => clip(redact(String(s ?? '').trim())) || null;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('the a an to for of and on in at by is are was be will ill we i our my me you it this that with again still up'.split(' '));
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w && !STOP.has(w)));
// Jaccard for deduplication (strict); `contains` for search (a query term set inside a longer text).
function similarity(a, b, mode = 'jaccard') {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (mode === 'contains' ? A.size : A.size + B.size - inter);
}

// ---------- time ----------
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// Resolve a deadline phrase against `now`. Returns ISO string or null (unknown = null, never guessed).
export function parseDeadline(text, now = new Date()) {
  if (!text) return null;
  const t = norm(text);
  const iso = String(text).match(/\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?/);
  if (iso) {
    const d = iso[1] ? new Date(iso[0]) : endOfDay(new Date(iso[0] + 'T00:00:00'));
    return isNaN(d) ? null : d.toISOString();
  }
  if (/\b(today|tonight|eod|end of day|end of today|this evening)\b/.test(t)) return endOfDay(now).toISOString();
  if (/\btomorrow\b/.test(t)) return endOfDay(addDays(now, 1)).toISOString();
  const inDays = t.match(/\bin (\d+) days?\b/);
  if (inDays) return endOfDay(addDays(now, +inDays[1])).toISOString();
  if (/\b(end of (the )?week|this week|eow)\b/.test(t)) {
    const diff = (5 - now.getDay() + 7) % 7;
    return endOfDay(addDays(now, diff)).toISOString();
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (wd >= 0) {
    let diff = (wd - now.getDay() + 7) % 7;
    if (/\bnext\b/.test(t) && diff === 0) diff = 7;
    return endOfDay(addDays(now, diff)).toISOString();
  }
  return null;
}

// ---------- heuristic extraction (pre-pass; the model makes the final call) ----------
const DEADLINE_RE = /\b(by |before |on )?(tonight|today|tomorrow|eod|end of (the )?(day|week)|this week|next week|in \d+ days?|(next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b/i;
const INJECTION_RE = /\b(ignore (all |any )?(previous|prior|above) (instructions|messages)|disregard (the |all )?(rules|instructions)|system prompt|you are now|new instructions:|act as (an? )?(admin|developer)|mark (all|every) .* (done|resolved)|delete (all|the) (commitments|ledger|memory))\b/i;
const HEDGE_RE = /\b(maybe|might|perhaps|probably|possibly|if we|if i|could try|would be nice|thinking about|not sure|someday|at some point)\b/i;
const NEG_RE = /\b(i|we) (won't|will not|can't|cannot|am not going to|are not going to)\b|\b(i|we) (said|told \w+) (i|we)('d| would)\b|\b(was|were) going to\b/i;
const COMMIT_RE = /\b(i|we)(?:'ll| will| am going to|'m going to| are going to|'re going to| owe| promise to| promised to| commit to)\b\s*(.*)$/i;
const REQUEST_RE = /^(?:hey \w+,? )?(?:can|could|would) (you|someone|somebody|anyone)\b\s*(.*)$|^(?:please|pls)\b\s*(.*)$/i;
const QUERY_RE = /\b(what('s| is| are)? (still )?(open|pending|due|overdue)|on the hook|what did (we|i|you) (promise|decide|commit)|what are we waiting on|what changed|status of)\b/i;
const ISSUE_RE = /\b(broken|bug|crash(es|ed|ing)?|is down|went down|failing|fails|error(s)?|not working|doesn't work|isn't working|stopped working|outage|regression|timing out|times out)\b/i;
const DECISION_RE = /\b(we decided|decided to|decision:|we're going with|we are going with|let's go with|we agreed|agreed to|agreed on|final call)\b\s*(.*)$/i;
const RESOLVE_RE = /^(?:ok,? |okay,? |update:? )?(?:(?:i|we)(?:'ve| have)? (?:just |finally )?(sent|shipped|fixed|delivered|finished|closed|resolved|merged|paid|signed|submitted|emailed|completed)\b|(done|sent|fixed|shipped|delivered)\b[.! ]*$|.* (is|was|has been|got) (fixed|resolved|sent|delivered|shipped|closed)\b)/i;
const NAME_AFTER_VERB = /\b(?:send|email|ping|call|tell|update|pay|introduce|message|text|remind|invoice|reply to|follow up with|get back to|share with)\s+([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/;
const NAME_AFTER_PREP = /\b(?:to|for|with)\s+([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)\b/;
const ORG_SAYS = /^([A-Z][A-Za-z0-9&.]+(?: [A-Z][A-Za-z0-9&.]+)?)\s+(?:says|said|reports|reported|reports that|mentioned|complained)\b[ ,:]*(?:that )?(.*)$/;

const sentences = (text) => String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const stripDeadline = (s) => s.replace(DEADLINE_RE, '').replace(/\s+(by|before|on)\s*$/i, '').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();

export function extract(text, ctx = {}) {
  const out = [];
  const speaker = ctx.speaker || null;
  for (const s of sentences(text)) {
    const base = { evidence: s, source_channel: ctx.channel || null, source_session: ctx.session || null, source_reference: ctx.ref || null, speaker };
    if (INJECTION_RE.test(s)) { out.push({ kind: 'ignored', reason: 'untrusted_instruction', ...base }); continue; }
    if (QUERY_RE.test(s)) { out.push({ kind: 'query', ...base }); continue; }
    if (NEG_RE.test(s)) continue;
    const dl = s.match(DEADLINE_RE);
    const deadline_text = dl ? dl[0].trim() : null;
    let m;
    if ((m = s.match(RESOLVE_RE)) && !COMMIT_RE.test(s)) {
      out.push({ kind: 'resolution', ...base, confidence: 'medium' });
      continue;
    }
    if ((m = s.match(DECISION_RE))) {
      out.push({ kind: 'decision', type: 'decision', decision: stripDeadline(m[2] || s).replace(/^to /i, ''), participants: speaker ? [speaker] : [], confidence: HEDGE_RE.test(s) ? 'low' : 'high', ...base });
      continue;
    }
    if (ISSUE_RE.test(s) && !COMMIT_RE.test(s)) {
      const says = s.match(ORG_SAYS);
      const stakeholder = says ? says[1] : (s.match(NAME_AFTER_PREP) || [])[1] || null;
      const title = stripDeadline(says ? says[2] : s);
      out.push({ kind: 'issue', type: 'issue', title, stakeholder, owner: null, priority: 'normal', confidence: stakeholder ? 'high' : 'medium', ...base });
      continue;
    }
    if ((m = s.match(COMMIT_RE))) {
      const we = /^we\b/i.test(m[0].trim());
      const rest = m[2] || '';
      const owes = /\bowe$/i.test(m[0].replace(m[2], '').trim());
      const counterparty = ((owes && rest.match(/^([A-Z][a-zA-Z]+)/)) || rest.match(NAME_AFTER_VERB) || rest.match(NAME_AFTER_PREP) || [])[1] || null;
      const action = stripDeadline(owes && counterparty ? `give ${counterparty} ${rest.slice(counterparty.length).trim()}` : rest);
      if (!action || tokens(action).size === 0) continue;
      let confidence = deadline_text || counterparty ? 'high' : 'medium';
      if (HEDGE_RE.test(s) || /\?\s*$/.test(s)) confidence = 'low';
      out.push({ kind: 'commitment', type: 'commitment', owner: we ? 'team' : speaker, counterparty, action, deadline_text, confidence, ...base });
      continue;
    }
    if ((m = s.match(REQUEST_RE))) {
      const rest = (m[2] || m[3] || '').replace(/\?\s*$/, '');
      const action = stripDeadline(rest);
      if (!action || tokens(action).size === 0) continue;
      const counterparty = (rest.match(NAME_AFTER_VERB) || rest.match(NAME_AFTER_PREP) || [])[1] || null;
      out.push({ kind: 'commitment', type: 'commitment', owner: null, requested_by: speaker, counterparty, action, deadline_text, confidence: 'medium', ...base });
    }
  }
  return out;
}

// ---------- storage ----------
const EMPTY = () => ({ version: 1, seq: { C: 0, I: 0, D: 0, A: 0 }, items: [], people: [], actions: [] });
const PREFIX = { commitment: 'C', issue: 'I', decision: 'D' };

export class Ledger {
  constructor(dir, { now, memoryDir } = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'ledger.json');
    this.memoryDir = memoryDir === undefined ? null : memoryDir;
    this.nowFn = now ? () => new Date(now) : () => new Date();
  }
  now() { return this.nowFn(); }
  // Cross-process lock so two teammates' sessions can't clobber each other's writes.
  tx(fn) {
    fs.mkdirSync(this.dir, { recursive: true });
    const lock = this.file + '.lock';
    const start = Date.now();
    for (;;) {
      try { fs.mkdirSync(lock); break; } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmdirSync(lock); continue; } } catch {}
        if (Date.now() - start > 10000) throw new Error('ledger is locked by another process');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    try {
      const db = this.read();
      const res = fn(db);
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, this.file);
      return res;
    } finally { fs.rmdirSync(lock); }
  }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') return EMPTY();
      throw new Error(`cannot read ${this.file}: ${e.message}`);
    }
  }
  log(line) {
    if (!this.memoryDir) return;
    const d = this.now();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fs.mkdirSync(this.memoryDir, { recursive: true });
    const time = d.toTimeString().slice(0, 5);
    fs.appendFileSync(path.join(this.memoryDir, `${day}.md`), `- ${time} RELAY ${redact(line)}\n`);
  }
}

function touchPerson(db, name, at) {
  if (!name || ['team', 'unassigned'].includes(norm(name))) return;
  if (findPerson(db, name)) return;
  db.people.push({ name: clean(name), aliases: [], role: null, organization: null, notes: null, created_at: at });
}
function findPerson(db, name) {
  const n = norm(name);
  return db.people.find((p) => norm(p.name) === n || p.aliases.some((a) => norm(a) === n));
}
function namesFor(db, name) {
  const p = findPerson(db, name);
  return new Set((p ? [p.name, ...p.aliases] : [name]).map(norm));
}
const partiesOf = (it) => [it.owner, it.counterparty, it.stakeholder, it.requested_by, ...(it.participants || [])].filter(Boolean);
const subjectOf = (it) => it.action || it.title || it.decision || '';

// ---------- mutations ----------
export function capture(led, input) {
  const type = input.type;
  if (!PREFIX[type]) throw new UserError(`type must be one of: ${Object.keys(PREFIX).join(', ')}`);
  if (!input.evidence) throw new UserError('evidence (the original message text) is required for provenance');
  if (input.confidence === 'low') {
    return { result: 'needs_clarification', message: 'Confidence is low. Ask the team to confirm who/what/when before recording this.' };
  }
  const subject = clean(input.action || input.title || input.decision);
  if (!subject) throw new UserError(type === 'commitment' ? 'action is required' : type === 'issue' ? 'title is required' : 'decision is required');
  return led.tx((db) => {
    const at = led.now().toISOString();
    const ev = { text: clean(input.evidence), by: clean(input.speaker || input.by), channel: clean(input.source_channel), session: clean(input.source_session), ref: clean(input.source_reference), at, kind: 'capture' };
    // Idempotent re-ingest: same message already recorded.
    if (ev.ref) {
      const same = db.items.find((it) => it.type === type && it.evidence.some((e) => e.ref === ev.ref && e.channel === ev.channel && e.kind === 'capture') && similarity(subjectOf(it), subject) >= 0.5);
      if (same) return { result: 'duplicate', item: same };
    }
    const party = norm(input.counterparty || input.stakeholder || '');
    const dup = db.items.find((it) => it.type === type && it.status === 'open'
      && (!party || !norm(it.counterparty || it.stakeholder || '') || namesFor(db, party).has(norm(it.counterparty || it.stakeholder)))
      && similarity(subjectOf(it), subject) >= 0.6);
    const deadline = input.deadline ? parseDeadline(input.deadline, led.now()) : parseDeadline(input.deadline_text, led.now());
    if (dup) {
      dup.evidence.push({ ...ev, kind: 'update' });
      for (const k of ['owner', 'counterparty', 'stakeholder', 'next_action', 'priority', 'description']) if (input[k] && !dup[k]) dup[k] = clean(input[k]);
      if (deadline) { dup.deadline = deadline; dup.deadline_text = clean(input.deadline_text || input.deadline); }
      dup.updated_at = at;
      led.log(`updated ${dup.id}: ${subjectOf(dup)} (repeat mention by ${ev.by || 'unknown'})`);
      return { result: 'updated', item: dup };
    }
    const id = `${PREFIX[type]}-${++db.seq[PREFIX[type]]}`;
    const item = {
      id, type, status: 'open', confidence: input.confidence || 'medium',
      owner: clean(input.owner) || (type === 'decision' ? null : 'unassigned'),
      created_at: at, updated_at: at, resolved_at: null,
      source_channel: ev.channel, source_session: ev.session, source_reference: ev.ref,
      evidence: [ev],
    };
    if (type === 'commitment') Object.assign(item, { action: subject, counterparty: clean(input.counterparty), requested_by: clean(input.requested_by), deadline, deadline_text: clean(input.deadline_text || input.deadline), next_action: clean(input.next_action) || subject });
    if (type === 'issue') Object.assign(item, { title: subject, description: clean(input.description), stakeholder: clean(input.stakeholder), priority: clean(input.priority) || 'normal', next_action: clean(input.next_action) || 'investigate and reply to ' + (input.stakeholder || 'reporter') });
    if (type === 'decision') Object.assign(item, { decision: subject, context: clean(input.context), participants: (input.participants || []).map(clean), date: at.slice(0, 10) });
    db.items.push(item);
    for (const n of partiesOf(item)) touchPerson(db, n, at);
    led.log(`captured ${id} [${type}] ${describe(item)} — "${clip(ev.text, 160)}" (${ev.by || 'unknown'} via ${ev.channel || 'unknown channel'})`);
    return { result: 'created', item };
  });
}

export function resolve(led, id, { evidence, by, ref, channel, status = 'resolved' } = {}) {
  if (!evidence) throw new UserError('resolution needs evidence (the message or artifact proving it happened)');
  return led.tx((db) => {
    const it = db.items.find((x) => x.id === id);
    if (!it) throw new UserError(`no item ${id}`);
    if (it.status !== 'open') return { result: 'unchanged', item: it };
    const at = led.now().toISOString();
    it.status = status;
    it.resolved_at = at;
    it.updated_at = at;
    it.evidence.push({ text: clean(evidence), by: clean(by), channel: clean(channel), ref: clean(ref), at, kind: 'resolution' });
    led.log(`${status} ${id}: ${subjectOf(it)} — "${clip(clean(evidence), 160)}" (${by || 'unknown'})`);
    return { result: status, item: it };
  });
}

export function update(led, id, patch, by) {
  const allowed = ['owner', 'counterparty', 'stakeholder', 'next_action', 'priority', 'description', 'deadline', 'status', 'action', 'title', 'context'];
  return led.tx((db) => {
    const it = db.items.find((x) => x.id === id);
    if (!it) throw new UserError(`no item ${id}`);
    const at = led.now().toISOString();
    const changed = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.includes(k)) throw new UserError(`cannot update field ${k}`);
      if (k === 'status' && v === 'resolved') throw new UserError('use `resolve` so the resolution carries evidence');
      if (k === 'status' && !['open', 'cancelled'].includes(v)) throw new UserError('status can be set to open or cancelled');
      it[k] = k === 'deadline' ? parseDeadline(v, led.now()) : clean(v);
      if (k === 'deadline') it.deadline_text = clean(v);
      changed.push(k);
    }
    it.updated_at = at;
    it.evidence.push({ text: `updated ${changed.join(', ')}`, by: clean(by), at, kind: 'update' });
    led.log(`edited ${id} (${changed.join(', ')}) by ${by || 'unknown'}`);
    return { result: 'updated', item: it };
  });
}

export function upsertPerson(led, input) {
  if (!input.name) throw new UserError('name is required');
  return led.tx((db) => {
    let p = findPerson(db, input.name) || (input.aliases || []).map((a) => findPerson(db, a)).find(Boolean);
    if (!p) { p = { name: clean(input.name), aliases: [], role: null, organization: null, notes: null, created_at: led.now().toISOString() }; db.people.push(p); }
    for (const a of [input.name, ...(input.aliases || [])]) if (norm(a) !== norm(p.name) && !p.aliases.some((x) => norm(x) === norm(a))) p.aliases.push(clean(a));
    for (const k of ['role', 'organization', 'notes']) if (input[k]) p[k] = clean(input[k]);
    return { result: 'ok', person: p };
  });
}

// ---------- approval-gated actions ----------
const ACTION_KINDS = ['send_message', 'create_task', 'create_calendar_event'];
export function propose(led, input) {
  if (!ACTION_KINDS.includes(input.kind)) throw new UserError(`kind must be one of ${ACTION_KINDS.join(', ')}`);
  if (!input.body) throw new UserError('body (the exact draft) is required');
  return led.tx((db) => {
    const key = crypto.createHash('sha256').update([input.kind, norm(input.target), input.body].join('\u0000')).digest('hex').slice(0, 16);
    const existing = db.actions.find((a) => a.idempotency_key === key && a.status !== 'cancelled');
    if (existing) return { result: 'duplicate', action: existing };
    const a = {
      id: `A-${++db.seq.A}`, kind: input.kind, target: clean(input.target), channel: clean(input.channel), body: redact(String(input.body)),
      item_id: input.item_id || null, status: 'pending_approval', idempotency_key: key,
      proposed_by: clean(input.by), created_at: led.now().toISOString(), approved_by: null, approved_at: null, executed_at: null, receipt: null,
    };
    db.actions.push(a);
    led.log(`drafted ${a.id} (${a.kind} → ${a.target || 'unspecified'}) awaiting approval`);
    return { result: 'pending_approval', action: a };
  });
}
export function approve(led, id, by) {
  if (!by) throw new UserError('approver identity (--by) is required');
  const allow = (process.env.RELAY_APPROVERS || '').split(',').map(norm).filter(Boolean);
  if (allow.length && !allow.includes(norm(by))) throw new UserError(`${by} is not in RELAY_APPROVERS`);
  return led.tx((db) => {
    const a = db.actions.find((x) => x.id === id);
    if (!a) throw new UserError(`no action ${id}`);
    if (a.status !== 'pending_approval') throw new UserError(`${id} is ${a.status}; it will not be executed again`);
    a.status = 'approved'; a.approved_by = clean(by); a.approved_at = led.now().toISOString();
    led.log(`approved ${id} by ${by}`);
    return { result: 'approved', action: a, instruction: 'Execute this exact action once with the configured tool, then run `done` with the receipt. If no tool is configured, run `cancel` and tell the user.' };
  });
}
export function finishAction(led, id, { receipt, cancel = false } = {}) {
  if (!cancel && !receipt) throw new UserError('receipt (message id / tool result) is required to mark an action done');
  return led.tx((db) => {
    const a = db.actions.find((x) => x.id === id);
    if (!a) throw new UserError(`no action ${id}`);
    if (cancel) { if (a.status === 'executed') throw new UserError(`${id} already executed`); a.status = 'cancelled'; led.log(`cancelled ${id}`); return { result: 'cancelled', action: a }; }
    if (a.status !== 'approved') throw new UserError(`${id} is ${a.status}; only approved actions can be marked done`);
    a.status = 'executed'; a.executed_at = led.now().toISOString(); a.receipt = clean(receipt);
    led.log(`executed ${id} receipt=${a.receipt}`);
    return { result: 'executed', action: a };
  });
}

// ---------- queries ----------
export function query(db, f = {}, now = new Date()) {
  let items = db.items;
  const status = f.status || 'open';
  if (status !== 'all') items = items.filter((i) => i.status === status);
  if (f.type) items = items.filter((i) => i.type === f.type);
  if (f.person) { const names = namesFor(db, f.person); items = items.filter((i) => partiesOf(i).some((p) => names.has(norm(p)))); }
  if (f.owner) { const names = namesFor(db, f.owner); items = items.filter((i) => i.owner && names.has(norm(i.owner))); }
  if (f.unowned) items = items.filter((i) => i.type !== 'decision' && (!i.owner || norm(i.owner) === 'unassigned'));
  if (f.overdue) items = items.filter((i) => i.deadline && new Date(i.deadline) < now);
  if (f.dueToday) items = items.filter((i) => i.deadline && sameLocalDay(i.deadline, now));
  if (f.since) { const s = new Date(f.since); items = items.filter((i) => new Date(i.updated_at) >= s); }
  if (f.text) items = items.filter((i) => similarity(f.text, [subjectOf(i), i.context, partiesOf(i).join(' '), ...i.evidence.map((e) => e.text)].join(' '), 'contains') >= 0.5);
  return [...items].sort(rank(now));
}
const PRI = { urgent: 0, high: 1, normal: 2, low: 3 };
const rank = (now) => (a, b) => {
  const od = (x) => (x.deadline && new Date(x.deadline) < now ? 0 : 1);
  return od(a) - od(b) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || (PRI[a.priority] ?? 2) - (PRI[b.priority] ?? 2) || a.created_at.localeCompare(b.created_at);
};

const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function dueLabel(it, now) {
  if (!it.deadline) return it.deadline_text ? `"${it.deadline_text}" (unresolved date)` : 'no deadline';
  const d = new Date(it.deadline);
  if (d < now) {
    const days = Math.floor((endOfDay(now) - endOfDay(d)) / 86400000);
    return days >= 1 ? `overdue by ${days} day${days > 1 ? 's' : ''}` : `overdue since ${fmtDate(it.deadline)}`;
  }
  if (sameLocalDay(d, now)) return 'today';
  if (sameLocalDay(d, addDays(now, 1))) return 'tomorrow';
  return fmtDate(it.deadline);
}
function describe(it) {
  if (it.type === 'commitment') return `${it.owner || 'unassigned'} → ${it.counterparty || '—'}: ${it.action}`;
  if (it.type === 'issue') return `${it.stakeholder || 'unknown reporter'}: ${it.title}`;
  return it.decision;
}
export function formatItem(it, now, { provenance = true } = {}) {
  const first = it.evidence[0];
  const last = it.evidence[it.evidence.length - 1];
  const lines = [`${it.id} [${it.type}] ${describe(it)}`];
  if (it.type !== 'decision') lines.push(`   Owner: ${it.owner || 'unassigned'} · Due: ${dueLabel(it, now)} · Status: ${it.status}`);
  else lines.push(`   Decided: ${it.date}${it.participants?.length ? ' · by ' + it.participants.join(', ') : ''}`);
  if (provenance && first) lines.push(`   Source: "${clip(first.text, 140)}" — ${first.by || 'unknown'}, ${first.channel || 'unknown channel'}${first.ref ? ' #' + first.ref : ''}, ${fmtDate(first.at)}`);
  if (provenance && last !== first) lines.push(`   Latest: "${clip(last.text, 140)}" — ${last.by || 'unknown'}, ${fmtDate(last.at)}`);
  return lines.join('\n');
}

export function brief(db, now = new Date(), { staleDays = 3 } = {}) {
  const open = query(db, {}, now).filter((i) => i.type !== 'decision');
  const overdue = open.filter((i) => i.deadline && new Date(i.deadline) < now);
  const today = open.filter((i) => i.deadline && sameLocalDay(i.deadline, now) && !overdue.includes(i));
  const issues = open.filter((i) => i.type === 'issue' && !overdue.includes(i) && !today.includes(i));
  const waiting = open.filter((i) => i.type === 'commitment' && i.counterparty && !overdue.includes(i) && !today.includes(i));
  const shown = new Set([...overdue, ...today, ...issues, ...waiting]);
  const stale = open.filter((i) => !shown.has(i) && (now - new Date(i.updated_at)) / 86400000 >= staleDays);
  const unowned = open.filter((i) => !i.owner || norm(i.owner) === 'unassigned');
  const pending = db.actions.filter((a) => a.status === 'pending_approval');
  const total = shown.size + stale.length;
  const out = [`RELAY — Morning (${now.toDateString()})`];
  if (!total && !pending.length) return out.concat('No open loops. Nothing is waiting on the team.').join('\n');
  out.push(`${total} open loop${total === 1 ? ' needs' : 's need'} attention`);
  let n = 0;
  const section = (title, list) => {
    if (!list.length) return;
    out.push('', title);
    for (const it of list) {
      const who = it.type === 'issue' ? it.stakeholder || 'unknown reporter' : it.counterparty || it.owner || 'team';
      out.push(`${++n}. ${who} — ${subjectOf(it)} (${it.id})`, `   Due: ${dueLabel(it, now)} · Owner: ${it.owner || 'unassigned'}`, `   Last evidence: "${clip(it.evidence.at(-1).text, 100)}" (${fmtDate(it.evidence.at(-1).at)})`);
    }
  };
  section('Overdue', overdue);
  section('Due today', today);
  section('Open customer / partner issues', issues);
  section('People waiting on the team', waiting);
  section(`Stale (no update in ${staleDays}+ days)`, stale);
  if (unowned.length) out.push('', `Unowned: ${unowned.map((i) => i.id).join(', ')} — assign an owner.`);
  if (pending.length) out.push('', `Drafts awaiting approval: ${pending.map((a) => `${a.id} (${a.kind} → ${a.target || '?'})`).join(', ')}`);
  const next = [...overdue, ...today, ...issues].slice(0, 3).map((i) => `- ${i.next_action || subjectOf(i)} (${i.id})`);
  if (next.length) out.push('', 'Next:', ...next);
  return out.join('\n');
}

export function changes(db, since, now = new Date()) {
  const s = new Date(since);
  const rows = [];
  for (const it of db.items) for (const e of it.evidence) if (new Date(e.at) >= s) rows.push({ at: e.at, line: `${e.kind === 'capture' ? 'NEW' : e.kind === 'resolution' ? 'RESOLVED' : 'UPDATED'} ${it.id} ${describe(it)} — ${e.by || 'unknown'}` });
  for (const a of db.actions) for (const [k, t] of [['DRAFTED', a.created_at], ['APPROVED', a.approved_at], ['EXECUTED', a.executed_at]]) if (t && new Date(t) >= s) rows.push({ at: t, line: `${k} ${a.id} ${a.kind} → ${a.target || '?'}` });
  rows.sort((a, b) => a.at.localeCompare(b.at));
  return rows.length ? rows.map((r) => `${fmtDate(r.at)}  ${r.line}`).join('\n') : `No changes since ${fmtDate(since)}.`;
}

// ---------- CLI ----------
class UserError extends Error {}
function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) opt[k] = true; else { opt[k] = v; i++; } }
    else pos.push(a);
  }
  return { pos, opt };
}
function channelContext() {
  // Set by OpenClaw exec for channel-origin runs; shape is channel-defined, so read defensively.
  try { return JSON.parse(process.env.OPENCLAW_CHANNEL_CONTEXT || 'null') || {}; } catch { return {}; }
}
const readJson = (opt) => {
  const raw = opt.json === true || opt.json === undefined ? fs.readFileSync(0, 'utf8') : opt.json;
  try { return JSON.parse(raw); } catch { throw new UserError('--json must be valid JSON'); }
};

const HELP = `relay <command>
  extract --text T [--speaker S] [--channel C] [--session X] [--ref R]   heuristic candidates (no writes)
  capture --json '{type,...}'                 record commitment|issue|decision (deduplicated)
  resolve ID --evidence T [--by S] [--ref R]  close an item (evidence required)
  cancel-item ID --evidence T [--by S]        mark an item cancelled
  update ID --json '{field:value}' [--by S]   edit owner/deadline/next_action/...
  list [--status open|resolved|cancelled|all] [--type T] [--person P] [--owner P] [--unowned] [--overdue] [--due-today] [--since ISO] [--text Q] [--json]
  show ID [--json]                            item with full provenance
  brief                                       morning brief
  changes --since ISO|yesterday
  person --json '{name,aliases,role,organization,notes}' | people
  propose --json '{kind,target,channel,body,item_id}'   draft an outbound action
  approve A-ID --by S | done A-ID --receipt R | cancel A-ID | actions
global: --data DIR (default $RELAY_DATA or ./relay-data), --memory DIR|none (default $RELAY_MEMORY_DIR or ./memory), --now ISO`;

export function main(argv, io = { out: (s) => process.stdout.write(s + '\n') }) {
  const { pos, opt } = parseArgs(argv);
  const [cmd, id] = pos;
  const now = opt.now ? new Date(opt.now) : new Date();
  const memOpt = opt.memory ?? process.env.RELAY_MEMORY_DIR ?? './memory';
  const led = new Ledger(path.resolve(opt.data || process.env.RELAY_DATA || './relay-data'), { now: opt.now, memoryDir: memOpt === 'none' ? null : path.resolve(memOpt) });
  const ctx = channelContext();
  const by = opt.by || opt.speaker || ctx.senderName || ctx.sender || ctx.senderId || null;
  const json = (x) => io.out(JSON.stringify(x, null, 2));
  switch (cmd) {
    case 'extract': return json(extract(opt.text === true ? fs.readFileSync(0, 'utf8') : opt.text || '', { speaker: by, channel: opt.channel || ctx.channel || null, session: opt.session || null, ref: opt.ref || ctx.messageId || null }));
    case 'capture': { const input = readJson(opt); if (!input.speaker && by) input.speaker = by; if (!input.source_channel && ctx.channel) input.source_channel = ctx.channel; return json(capture(led, input)); }
    case 'resolve': return json(resolve(led, id, { evidence: opt.evidence, by, ref: opt.ref, channel: opt.channel || ctx.channel }));
    case 'cancel-item': return json(resolve(led, id, { evidence: opt.evidence, by, ref: opt.ref, status: 'cancelled' }));
    case 'update': return json(update(led, id, readJson(opt), by));
    case 'list': {
      const db = led.read();
      const items = query(db, { status: opt.status, type: opt.type, person: opt.person, owner: opt.owner, unowned: opt.unowned, overdue: opt.overdue, dueToday: opt['due-today'], since: opt.since, text: opt.text }, now);
      if (opt.json) return json(items);
      return io.out(items.length ? items.map((i) => formatItem(i, now)).join('\n') : 'Nothing matches.');
    }
    case 'show': { const it = led.read().items.find((i) => i.id === id); if (!it) throw new UserError(`no item ${id}`); return opt.json ? json(it) : io.out(formatItem(it, now) + '\n   History:\n' + it.evidence.map((e) => `   - ${e.kind} ${fmtDate(e.at)} ${e.by || 'unknown'} (${e.channel || '?'}${e.ref ? ' #' + e.ref : ''}): "${e.text}"`).join('\n')); }
    case 'brief': return io.out(brief(led.read(), now));
    case 'changes': { const since = opt.since === 'yesterday' || !opt.since ? addDays(now, -1).toISOString() : opt.since; return io.out(changes(led.read(), since, now)); }
    case 'person': return json(upsertPerson(led, readJson(opt)));
    case 'people': { const db = led.read(); return io.out(db.people.map((p) => `${p.name}${p.aliases.length ? ' (aka ' + p.aliases.join(', ') + ')' : ''}${p.role ? ' · ' + p.role : ''}${p.organization ? ' @ ' + p.organization : ''} · open: ${query(db, { person: p.name }, now).map((i) => i.id).join(', ') || 'none'}`).join('\n') || 'No people yet.'); }
    case 'propose': { const input = readJson(opt); if (!input.by && by) input.by = by; return json(propose(led, input)); }
    case 'approve': return json(approve(led, id, by));
    case 'done': return json(finishAction(led, id, { receipt: opt.receipt }));
    case 'cancel': return json(finishAction(led, id, { cancel: true }));
    case 'actions': return json(led.read().actions.filter((a) => opt.all || !['executed', 'cancelled'].includes(a.status)));
    default: return io.out(HELP);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`relay: ${e.message}\n`);
    process.exit(e instanceof UserError ? 2 : 1);
  }
}
