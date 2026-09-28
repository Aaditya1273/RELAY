# Demo

Two ways to run it: an offline rehearsal that proves the engine, and the live 60-second
demo on a real OpenClaw agent.

## Offline rehearsal (deterministic, no model, no network)

```bash
npm run demo
```

This plays the scenario below against a throwaway ledger and prints each step. The same
scenario is asserted in `test/relay.test.mjs` ("E2E multiplayer scenario via CLI").

## Live demo — setup

- One RELAY agent installed (INSTALL.md) with at least two ways in: e.g. a team Slack
  channel and a WhatsApp/Telegram group, or a Plow phone-line group and the owner DM.
- Three people (or two people and two conversations): A = Aaditya, B = Priya, C = Meera.
- Empty ledger: `rm -rf <workspace>/relay-data` before recording.
- Optional: `relay person --json '{"name":"Anu","role":"investor"}'` so queries show the role.

## Script (60 seconds)

| Time | Who / where | Says | RELAY should |
| --- | --- | --- | --- |
| 0–10s | A in Slack #founders | "I'll send Anu the investor update tonight." | capture C-1 silently (owner Aaditya, counterparty Anu, due tonight) |
| 10–20s | B in WhatsApp support group | "Acme says export is broken again." | capture I-1 (stakeholder Acme, unowned) |
| 20–35s | C in Telegram DM | "Can someone check what we're still on the hook for?" | list C-1 and I-1 with sources from **both other chats** |
| 35–48s | A | "I sent Anu the update." then C: "What is still open?" | resolve C-1 with evidence; answer: only I-1 |
| 48–60s | C | "Draft a follow-up to Acme." → A: "approve A-1" | show draft A-1; after approval send it once via the message tool and report the receipt |

Expected answer to step 3 (wording may vary; ids, owners, dates and sources must match):

```
2 open
C-1 Aaditya → Anu: send the investor update · due today · open
    Source: "I'll send Anu the investor update tonight." — Aaditya, slack:#founders
I-1 Acme: export is broken again · no owner · open
    Source: "Acme says export is broken again." — Priya, whatsapp:support
Next: want to assign an owner for I-1?
```

What this proves:
- **Real work:** a promise and a customer issue become owned, dated items.
- **Multiplayer:** C sees what A and B said in chats C isn't in.
- **Persistent memory:** survives sessions and restarts (it's a file in the workspace).
- **Provenance:** every line carries who said it, where.
- **Safety:** the follow-up is a draft until someone approves it; nothing is sent twice.

If sending is not configured for the target channel, RELAY says the action was cancelled
and nothing was sent. Record that honestly rather than faking a send.

## Manual verification checklist

- [ ] `relay list` after step 1–2 shows C-1 and I-1 with the right channels
- [ ] step 3 answered from a third conversation
- [ ] `relay show C-1` has two evidence entries (capture + resolution)
- [ ] `relay actions --all` shows A-1 `executed` with a receipt, or `cancelled`
- [ ] repeating "approve A-1" is refused
- [ ] `memory/<today>.md` has one line per change
