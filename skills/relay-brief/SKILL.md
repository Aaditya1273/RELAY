---
name: relay-brief
description: Produce the RELAY Morning brief — overdue and due-today promises, conflicting details, open customer issues, people waiting on the team, what others owe us, tentative items, stale and unowned loops.
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# RELAY Morning brief

1. Run `node {baseDir}/../commitment-tracker/scripts/relay.mjs brief`.
2. Post the output as the reply. You may tighten wording, but:
   - keep every item id, owner and due label exactly as printed;
   - do not add percentages, progress estimates, dates or statuses that are not in the output;
   - do not add motivational filler;
   - keep the "Conflicting details — confirm" and "To confirm" sections: they are questions
     the team has to answer, not noise.
3. If the output says there are no open loops, reply `NO_REPLY` when running as a scheduled
   automation (so nothing is posted), or say so in one line when a person asked.
4. Append at most three concrete next actions, taken from the "Next:" block. If a draft
   would help, offer it — drafting uses the `relay-followup` skill and still needs approval.

This skill is designed to run from a scheduled automation (see INSTALL.md) and on demand
("morning brief", "what needs attention today?").
