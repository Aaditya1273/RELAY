# Quickstart (about 10 minutes)

Two ways to run RELAY: **on Plow** (text it on a phone line, no OpenClaw setup) or **inside
your own OpenClaw**. The Plow path comes first.

## Run on Plow

Needs Docker, Git, Python 3.11+ and the [plow-agents](https://github.com/plow-pbc/plow-agents) CLI.

```bash
git clone https://github.com/plow-pbc/plow-agents.git && export PATH="$PWD/plow-agents/bin:$PATH"
plow-agents login                 # text the activation phrase it prints
plow-agents lines                 # pick a free line id, e.g. ln_p2
git clone https://github.com/Aaditya1273/RELAY && cd RELAY
RELAY_TZ=Asia/Kolkata plow-agents deploy --local --line ln_p2   # your IANA timezone
```

Then text the line's number: "I'll send Anu the investor update tonight." and later
"What are we on the hook for?". Texting a US line needs a phone plan that can send SMS to +1 numbers.

## Run inside your own OpenClaw

Assumes OpenClaw 2026.8.1 ("2.0") or later is installed and one chat channel already works
(for example you can talk to your agent in Telegram or Slack). If not, set that up first:
<https://docs.openclaw.ai/>.

```bash
git clone https://github.com/Aaditya1273/RELAY && cd RELAY
npm test                          # optional sanity check
sh scripts/install.sh             # or: sh scripts/install.sh /path/to/workspace
openclaw skills list              # confirm the four relay skills are listed
openclaw gateway restart          # or send /new in chat
```

Try it in chat:

1. "I'll send Anu the investor update tonight."
2. From another person or another conversation: "What are we on the hook for?"
3. "I sent Anu the update." → then "What's still open?"

Schedule the morning brief (pick your channel, target and timezone):

```bash
openclaw automations create "0 9 * * 1-5" "Use the relay-brief skill." \
  --name "RELAY Morning" --tz "Asia/Kolkata" --session isolated \
  --announce --channel telegram --to "-1001234567890"
openclaw automations list
openclaw automations run <jobId> --wait    # test it now
```

Target formats: Slack/Discord `channel:<id>`, Telegram chat id (topics `-100…:topic:<n>`).
See <https://docs.openclaw.ai/automation/cron-jobs/delivery>.

Next: multiplayer, approvals and channel notes in [INSTALL.md](INSTALL.md).
