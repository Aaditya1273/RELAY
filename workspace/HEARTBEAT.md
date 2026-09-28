# RELAY heartbeat checklist

In OpenClaw 2026.8.1+ this file is not read automatically. Load it as the heartbeat
monitor scratch (see INSTALL.md):
`openclaw cron scratch <heartbeat-job-id> --file HEARTBEAT.md`
The morning brief is a separate scheduled automation, not part of the heartbeat.

Engine: `node skills/commitment-tracker/scripts/relay.mjs` (from the workspace), called `relay` below.

- Run `relay list --overdue`. For each item that became overdue since the last
  heartbeat, send one short nudge to its owner's conversation. Do not repeat a nudge for
  the same item on the same day.
- Run `relay list --waiting-on --overdue`. For each item someone outside the team owes us
  that became overdue, offer the owner of the relationship a drafted nudge (relay-followup),
  once. Never send it without approval.
- Run `relay actions`. If a draft has waited for approval for more than 4 hours, remind
  the person who asked for it, once.
- Nothing new → reply NO_REPLY.
