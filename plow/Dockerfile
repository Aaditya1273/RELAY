# RELAY on the Plow OpenClaw base image (https://github.com/plow-pbc/plow-openclaw-agent).
# Replace BASE_REF with a real, digest-pinned base reference from
# https://gallery.ecr.aws/e1h7x4a2/plow-cloud-agents  (tags are base-<sha>; pin @sha256:<digest>).
# Build from the repository root:  plow-agents image build -f plow/Dockerfile REGISTRY/relay:TAG .
ARG BASE_REF
FROM ${BASE_REF}

# Agent Index listing id (see HACKATHON.md). Without it nothing is reported.
ENV AGENT_ID=relay
ENV AGENT_NAME=RELAY
ENV AGENT_BLURB="The first hire who never forgets: shared memory of every promise your team makes."
# Keep the ledger on Plow's persistent state volume.
ENV RELAY_DATA=/var/lib/plow/relay-data

# Plow re-renders AGENTS.md at boot from this path and removes SOUL.md/IDENTITY.md/USER.md,
# so RELAY's persona and rules live entirely in prompt/AGENTS.md.
COPY prompt/AGENTS.md /opt/plow/prompt/AGENTS.md
COPY skills/ /opt/plow/skills/
