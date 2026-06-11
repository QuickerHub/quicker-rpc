# Authoring reference docs (standalone)

Deep module references for Quicker action authoring — **not** generated from `action-authoring-src/`.

| Path | Role |
|------|------|
| `step-modules/kc/` | KC crawl (`npm run docs:modules:crawl`) — full official text for search |
| `step-modules/authored/` | Hand-written agent refs (`authored/SPEC.md`) |
| `step-modules/examples/` | Step JSON examples (distilled from kc/authored) |
| `step-modules/_catalog.md` | Module catalog (updated by crawl script) |

## Consumers

- **QuickerAgent** `docs search(query, scope=references)` — MiniSearch index + `items[].snippet` (hit neighborhood, no follow-up get).
- **qkrpc CLI** — embedded from here via `QuickerRpc.AgentModel` (`references-manifest.json` paths unchanged).
- **Workflow topic** `step-modules` — `_catalog` is inlined when `npm run docs:gen` renders `catalogs/step-modules.md`.

Editing KC/authored/examples here does **not** require `docs:gen` unless `_catalog` or `topics.json` catalog metadata must refresh.
