# RELAY on the Plow OpenClaw base image (https://github.com/plow-pbc/plow-openclaw-agent).
# Base = plow-openclaw-agent commit e0217de (main on 2026-09-28). For a published image,
# pin by digest too: BASE_REF=public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-<sha>@sha256:<digest>
# (see https://gallery.ecr.aws/e1h7x4a2/plow-cloud-agents).
# Build:  plow-agents image build ghcr.io/<you>/relay:v1     (or: docker compose build)
ARG BASE_REF=public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-e0217de7c4fc5d8b7655aa4a1aaac8ed9f79cdf7
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
