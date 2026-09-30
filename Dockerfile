# RELAY on the Plow OpenClaw base image (https://github.com/plow-pbc/plow-openclaw-agent).
# Base = plow-openclaw-agent commit e0217de (main on 2026-09-28). For a published image,
# pin by digest too: BASE_REF=public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-<sha>@sha256:<digest>
# (see https://gallery.ecr.aws/e1h7x4a2/plow-cloud-agents).
# Build:  plow-agents image build ghcr.io/<you>/relay:v1     (or: docker compose build)
ARG BASE_REF=public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-771198a9609dcef54d44843e7da5329c17fa51b4@sha256:f1e7c421b97a80f1bd17015f96daceb965f350a241f7edc7e4d856a0e3a6f8f5
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
