# Third-party notices

RELAY has **no runtime or development dependencies**: the engine uses only Node.js
built-in modules, and the tests use `node:test`. No third-party code, text, images or
fonts are included in this repository.

## Referenced, not included

| Project | Relationship | License observed |
| --- | --- | --- |
| [OpenClaw](https://github.com/openclaw/openclaw) | runtime RELAY is installed into; docs consulted for APIs | see that repository |
| [Plow OpenClaw base image](https://github.com/plow-pbc/plow-openclaw-agent) | `Dockerfile` builds `FROM` it; the image is pulled at build time, not redistributed here | see that repository; confirm before redistributing a built image |
| [clawchief](https://github.com/snarktank/clawchief) by Ryan Carson | architectural reference during development | **no license file observed (2026-09-28)** — no clawchief text or code is included; see DEVELOPMENT_NOTES.md |

A built container image contains the Plow base and OpenClaw under their own licenses.
The MIT license in LICENSE covers only RELAY-authored files in this repository.
