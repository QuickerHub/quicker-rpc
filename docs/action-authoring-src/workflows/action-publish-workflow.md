# {{#topic-title}}

**When**: share an action to getquicker.net or push a new revision after edits. **NOT** program body — finish **authoring-workflow** P1–P7 first.

{{#include-partial workflow-checklist-action-publish}}

## Concepts

| concept | notes |
|---------|-------|
| actionId | GUID on your Quicker grid; use for first publish |
| sharedActionId | getquicker library GUID; stored on action after first share |
| mode `publish` | first-time share; needs title + description |
| mode `update` | refresh existing share; **changelog required** |
| Note | short share-page intro markdown on first publish (`note`) |
| 动作说明 (HTML page) | getquicker rich intro page — **built-in publish automation**, not Agent tools |

`action publish` auto-detects mode. `action update` is an alias (always update path).

## Pub0 Prerequisites

- Quicker running + logged in (getquicker author account).
- Program body saved in the action editor — **authoring-workflow** P7.
- Action is **your** work — not an unmodified install of someone else's shared action (`UseTemplate`).

## Pub1 Preflight

Before sharing:

```text
1. qkrpc action publish --id <guid> --preflight --json   # structured missing-field report
2. qkrpc_action_debug / action run --trace — smoke test
3. metadata — title, description (required for first publish)
4. public share — custom icon (fa:Light_* or image URL); NO _system icons
5. global subprograms — auto-embedded into share payload on first publish
6. secrets — remove API keys / tokens from action data before share
```

### Required fields (enforced)

| mode | field | source | issue code when missing |
|------|-------|--------|-------------------------|
| **publish** (first share) | `title` | `--title` or action metadata | `MISSING_TITLE` |
| **publish** | `description` | `--description` or action metadata | `MISSING_DESCRIPTION` |
| **publish** + `isPublic=true` (default) | `icon` | action metadata (`fa:Light_*` or image URL; not `_system`) | `MISSING_ICON` |
| **update** (refresh share) | `changelog` | `--changelog` or `--changelog-file` | `MISSING_CHANGELOG` |

`--preflight` returns `{ ready, mode, issues[] }` with `issues[].field` + `issues[].code` + `issues[].message`. Fix every issue before calling publish without `--preflight`.

{{#only-agent}}
```text
{{@ action.get.metadata id=<guid>}}
{{@ action.publish id=<guid> preflight=true}}
{{@ action.debug id=<guid>}}
{{@ action.set-metadata id=<guid> title="…" description="…" icon=fa:Light_<Name> N=<editVersion>}}
```
{{/only-agent}}

Icons: **action-icons**. File refs: validate/apply project before share.

## Pub2 Detect mode

| signal | mode |
|--------|------|
| `action get` metadata has `sharedActionId` | update |
| `--id` is shared GUID only (not on your grid) | update |
| action not yet shared (`sharedActionId` empty) | first publish |

{{#only-agent}}
```text
{{@ action.get.metadata id=<guid>}}
```
{{/only-agent}}

## Pub3 First publish

Required: **title**, **description** (tool flags or action metadata).

Optional: `note` (markdown intro), `tags`, `keywords`, `isPublic` (default true), `submitReview` (default true for public).

{{#only-agent}}
```text
{{@ action.publish id=<guid> title="My Action" description="One-line summary" note="## Intro\n…"}}
{{@ action.publish id=<guid> title="My Action" description="…" isPublic=false}}
```
Agent UI may ask approval before publish — confirm with user.
{{/only-agent}}

| response field | meaning |
|----------------|---------|
| `mode` | `publish` |
| `sharedId` | new library GUID — save for updates |
| `shareUrl` | getquicker link |
| `revision` | library revision after upload |

## Pub4 Update (refresh share)

After editing program body, push a new revision:

- **changelog required** (`changelog`)
- Pass **actionId** or **sharedActionId**

{{#only-agent}}
```text
{{@ action.publish id=<guid> changelog="v1.1: fix timeout; add retry"}}
```
`qkrpc_action_update` is deprecated — same as publish with changelog.
{{/only-agent}}

| response field | meaning |
|----------------|---------|
| `mode` | `update` |
| `sharedId` | unchanged library GUID |
| `message` | Quicker upload result |

Update uploads the current action body from Quicker — ensure the action editor saved your latest edits.

## Pub5 Action page intro — built-in automation (Agent STOP)

Short **Note** on first publish (`note`) ≠ getquicker **动作说明** HTML page (images, download blocks, semver placeholders).

| layer | who | how |
|-------|-----|-----|
| short intro | Agent (Pub3) | `note` on `action publish` |
| rich HTML page | **built-in automation** | publish/release pipeline syncs HTML to getquicker edit UI |

Updating the HTML **动作说明** is **built-in qkrpc automation** (`action shared-info-get` / `action shared-info-set` via agent-gui API) that reuses the logged-in Quicker author's web session to read/write getquicker **SharedAction Detail** HTML. It is **not** an Agent tool path.

{{#only-agent}}
**Agent rules**

- **STOP after Pub4** — do not call `action shared-info-get` / `action shared-info-set` autonomously.
- User asks to change **动作说明 / page HTML**: explain it is handled by built-in publish/release automation; offer Pub3 `note` markdown only.
{{/only-agent}}

### Preview HTML 动作说明 (agent-gui)

Use the **agent-gui** right-side **Playwright** browser panel to preview before uploading to getquicker.

| step | where | fidelity |
|------|-------|----------|
| Draft preview | agent-gui Playwright + preview API | matches HTML uploaded via `shared-info-set` |
| Live check | Playwright → `https://getquicker.net/Sharedaction?code=<sharedId>` | **ground truth** after upload |

**agent-gui side panel (Playwright tab)**

1. **Draft** — POST built HTML to the preview API, open the returned URL in the address bar:
   ```http
   POST /api/actions/shared-info/preview
   { "html": "<your info.html contents>" }
   → { "previewUrl": "http://127.0.0.1:3000/api/actions/shared-info/preview?token=..." }
   ```
2. **Published** — navigate to `Sharedaction?code=<sharedId>` (refresh after `shared-info-set`).

Open the right **Playwright** panel, paste `previewUrl` or the share link.

**Upload / sync** (human or release automation, not Agent):

```http
POST /api/actions/shared-info
{ "op": "set", "id": "<sharedId>", "html": "<contents>" }
```

Read current page HTML: same route with `"op": "get"`.

## Common flows

**W1 First share**: authoring P1–P7 → Pub1 preflight → Pub3 publish → copy `shareUrl`.

**W2 Iterate**: edit program in action editor → Pub4 update with changelog.

**W3 Private beta**: Pub3 with `isPublic: false`; flip public later in Quicker UI or re-share.

**W4 QuickerAgent plugin action**: Agent publishes program via Pub3–Pub4; HTML 动作说明 synced by release automation (`aa5917ad-…`), not Agent.

## Errors

| symptom / `issues[].code` | fix |
|---------|-----|
| `MISSING_CHANGELOG` | Pub4 — pass `changelog` on update |
| `MISSING_TITLE` | Pub1 — `action set-metadata --title` or `--title` on publish |
| `MISSING_DESCRIPTION` | Pub1 — `action set-metadata --description` or `--description` on publish |
| `MISSING_ICON` | Pub1 — `fa search` + `action set-metadata --icon fa:Light_*`; or `--private` |
| `UNMODIFIED_SHARED_INSTALL` | fork/edit original author's action first |
| `EMBED_SUBPROGRAMS_FAILED` | fix global subprogram refs before publish |
| `WEBCONNECTOR_UNAVAILABLE` | must run inside Quicker (not headless CLI-only) |
| user wants HTML 动作说明 | built-in publish automation — Agent STOP at Pub4; draft `note` only |

Run `qkrpc action publish --id <guid> --preflight --json` to list all blocking issues before upload.

## Related

overview · authoring-workflow · action-icons · action-organization · subprogram-workflow
