# Install

## 1. Prerequisites

| Need | Why | Check |
| --- | --- | --- |
| OpenClaw **2026.8.1+** | automations CLI, multi-user sessions, skill watcher | `openclaw --version` |
| Node 18+ on the gateway host | runs the RELAY engine via the `exec` tool | `node --version` |
| One working chat channel | where people talk to RELAY | message your agent |
| `exec` tool available to the agent | skills call the engine | default on gateway hosts |

Nothing else. No Google account, no database, no API keys beyond the model OpenClaw already uses.

## 2. Install the workspace pieces

```bash
sh scripts/install.sh [workspace]
```

Default workspace: `$OPENCLAW_WORKSPACE_DIR` or `~/.openclaw/workspace`
(<https://docs.openclaw.ai/concepts/agent-workspace>). The script:

- copies the four skills to `<workspace>/skills/` (highest-precedence skill location);
- adds a marked `<!-- RELAY:BEGIN -->…<!-- RELAY:END -->` block to `AGENTS.md` (re-running refreshes it; your text is kept);
- copies `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md` only if you don't already have them;
- creates `relay-data/` (the shared ledger) and `memory/`.

Then `openclaw skills list` and start a fresh session (`/new`) or `openclaw gateway restart`.
Existing sessions keep the AGENTS.md/skills they started with — after any RELAY update, test
in a new session.

### Model notes (learned on a live gateway)

- **Turn off Code Mode for the RELAY agent.** OpenClaw 2026.9 auto-enables experimental Code
  Mode for many Gemini/GPT/Claude models; the model then sees a JavaScript sandbox instead of
  the shell `exec` tool and spends its turn searching for how to run a command.
  `openclaw config set agents.entries.<agentId>.tools.codeMode false`
- **Free-tier API keys run out fast.** A RELAY turn is several model requests with a large
  prompt (~40k input tokens). Gemini free tier allows only a few dozen requests per model per
  day, and a 429 does not fail over to the next model. Use a paid key for a demo, or set
  `agents.defaults.model.primary` to a model with quota left.
- Lower the default 30-minute heartbeat if quota is tight:
  `openclaw config set agents.defaults.heartbeat '{"every":"2h","activeHours":{"start":"09:00","end":"21:00"}}'`

### Where the ledger lives

The engine uses `$RELAY_DATA`, else `./relay-data` relative to the command's working
directory (exec runs in the workspace by default). To pin it, set `RELAY_DATA` in the
gateway's environment to an absolute path, e.g. `~/.openclaw/workspace/relay-data`.
Recommended: `RELAY_TEAM` (comma list of teammates, e.g. `Aaditya,Priya,Meera`; anyone else's
messages count as external content, see SECURITY.md).
Optional: `RELAY_TZ` (IANA timezone for "today/tonight"), `RELAY_MEMORY_DIR`,
`RELAY_APPROVERS` (comma list of names allowed to approve sends).

### If exec is restricted

With `tools.exec.mode: "allowlist"` or `"ask"`, add an allowlist entry for `node` running
`skills/commitment-tracker/scripts/relay.mjs`, or expect approval prompts for each call.
Do not add `node` to `safeBins` (see <https://docs.openclaw.ai/tools/exec>).

## 3. Morning brief

```bash
openclaw automations create "0 9 * * 1-5" "Use the relay-brief skill." \
  --name "RELAY Morning" --tz "<IANA tz>" --session isolated \
  --announce --channel <slack|telegram|discord|whatsapp|…> --to "<target>"
openclaw automations run <jobId> --wait
```

Two timezones (e.g. IST and PT)? Create two jobs with different `--tz` and targets.

## 4. Overdue nudges (optional)

Heartbeat in 2026.8.1 reads its checklist from the heartbeat monitor scratch, not from a file:

```bash
openclaw cron list --all                                   # find "Heartbeat (<agent>)"
openclaw cron scratch <heartbeatJobId> --file workspace/HEARTBEAT.md
```

Heartbeat delivers to the owner DM by default and skips (`no-route`) until an owner is set,
e.g. `openclaw config set commands.ownerAllowFrom '["discord:<your user id>"]'`;
see <https://docs.openclaw.ai/gateway/heartbeat>.

## 5. Multiplayer

RELAY's shared state is the ledger file. Every session of the same agent — each teammate's
DM, each group, each email thread — runs the same skills against the same file. That is
what lets Priya's WhatsApp report show up when Meera asks in Telegram.

To let several people use one agent:
- add each person to the channel allowlists / pairing for the channels they use;
- for the Control UI, give each person a Gateway profile (multi-user mode shows owners,
  participants and presence — <https://docs.openclaw.ai/concepts/multi-user>);
- set `RELAY_TEAM` so RELAY can tell teammates from customers and partners. It drives the
  two-way ledger ("Rahul owes us" vs "Priya will fix it") and the trust gate;
- optionally set `RELAY_APPROVERS` so only named people can approve outbound actions.

What teammates will see in a shared deployment:
- **Conflicts.** When two people give different deadlines or owners, RELAY asks instead of
  choosing. Answer, and it runs `settle`.
- **Tentative items.** Hedged talk ("maybe I'll…") waits for `confirm C-n` or `reject C-n`.
- **Stale drafts.** A follow-up drafted before the item changed is refused at approval time;
  ask for a new draft.
- **Two approvals.** Drafts based only on outside content need a second teammate's "approve A-n".

**Shared:** the ledger (items, evidence, people, drafts) and the `memory/` audit log.
**Per person / per session:** chat transcripts, the private main session's MEMORY.md,
personal model accounts.
**Trust boundary:** OpenClaw is explicit that everyone who can operate an agent can make it
do anything that agent can do; ownership and presence are not isolation. RELAY adds no
isolation. Only put people on it who may see the team's promises. If two groups must not
see each other's data, run two agents (separate workspaces).

## 6. Approvals and actions

`relay-followup` drafts, then waits for "approve A-n" from a teammate. On approval the
agent sends the stored text once with OpenClaw's `message` tool and records the receipt.
No channel configured for the target → the action is cancelled and the team is told.
Latch/Mac tools or task/calendar MCP servers are used only if present in the session.

## 7. Plow / Agent Index

See [HACKATHON.md](HACKATHON.md) and `Dockerfile`.

## 8. Verify

```bash
npm test
npm run demo
```

In chat: make a promise in one conversation, ask "what's open?" in another, resolve it,
ask again, draft a follow-up, approve it. Expected outputs: [DEMO.md](DEMO.md).

## Uninstall

Remove the four skill folders and the RELAY block from `AGENTS.md`; delete `relay-data/`
if you want the memory gone; `openclaw automations remove <jobId>`.
