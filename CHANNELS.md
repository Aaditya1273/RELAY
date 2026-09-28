# Channels

RELAY has no channel code. It works in whatever conversations the OpenClaw agent is in,
because every session calls the same skills against the same ledger. Channels are
configured in OpenClaw, not here.

| Channel | How it's connected | RELAY status | Needs |
| --- | --- | --- | --- |
| Slack | OpenClaw channel plugin | Config required — not tested by us | bot token, channel allowlist |
| Telegram | OpenClaw channel plugin | Config required — not tested by us | bot token; group id for brief target |
| Discord | OpenClaw channel plugin | Config required — not tested by us | bot token, channel id |
| WhatsApp | OpenClaw channel plugin | Config required — not tested by us | device link on gateway host (`openclaw channels login`, run in a terminal, not via exec) |
| Plow phone line (iMessage/SMS-style texting, groups, email threads) | Plow OpenClaw base image | Config required — not tested by us | `plow-agents` account + line, base image digest (HACKATHON.md) |
| Control UI / WebChat | built into OpenClaw | Config required | Gateway profiles for multi-user |
| Gmail as a source | OpenClaw Gmail Pub/Sub triggers exist | **Not implemented** in RELAY | — |

"Not tested by us" means: the skills rely only on documented OpenClaw behaviour (sessions,
exec, message tool, automations), but this repository has not been run against that
channel on a live gateway. Please report results.

## Provenance per channel

The engine records `source_channel` as `<channel>:<conversation>` when the skill passes
it, or reads `OPENCLAW_CHANNEL_CONTEXT` (set by OpenClaw exec for channel-origin runs).
Message ids are stored as `source_reference` when the channel exposes them; that is also
what makes re-ingesting the same message a no-op.

## Brief delivery targets

`openclaw automations create … --announce --channel <id> --to <target>`:
Slack/Discord `channel:<id>` or `user:<id>`; Telegram chat id, topics `<chat>:topic:<n>`;
WhatsApp E.164. Source: <https://docs.openclaw.ai/automation/cron-jobs/delivery>.

## Group behaviour

In busy groups RELAY captures silently and only speaks when asked, when clarification is
needed, or for approved sends. Tune in AGENTS.md if your team wants ✓ acknowledgements.
