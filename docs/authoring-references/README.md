# Authoring reference docs (standalone)

Deep module references for Quicker action authoring — **not** generated from `action-authoring-src/`.

| Path | Role |
|------|------|
| `step-modules/kc/` | KC crawl (`npm run docs:modules:crawl`) — full official text for search |
| `step-modules/authored/` | Hand-written agent refs — JSON 示例 + 陷阱（`authored/SPEC.md`） |
| `step-modules/_catalog.md` | Module catalog (updated by crawl script) |

## Consumers

- **QuickerAgent** `docs search(query, scope=references)` — MiniSearch index + `items[].snippet`.
- **qkrpc CLI** — embedded from here via `QuickerRpc.AgentModel`; `docReference` on step-runner get points to `authored/<id>`.
- **Workflow topic** `step-modules` — `_catalog` is inlined when `npm run docs:gen` renders `catalogs/step-modules.md`.

Editing KC/authored here does **not** require `docs:gen` unless `_catalog` or catalog metadata must refresh.
