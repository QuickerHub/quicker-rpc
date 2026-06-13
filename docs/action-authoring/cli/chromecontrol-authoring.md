# ChromeControl authoring
<!-- qkrpc-search-aliases: 浏览器, 浏览器控制, 网页自动化, chrome, edge, 标签页, 选择器, 后台命令, chromecontrol -->

**When**: **sys:chromecontrol** steps in a Quicker action (user's Chrome/Edge/Firefox via Quicker extension). After P4 pick, before writing steps. Param keys: **step-runner-get** (`controlField: operation`); reference: **docs get** `step-modules` + `reference=chromecontrol` (authored); KC full text: `reference=kc/chromecontrol`.

**Not this topic**: QuickerAgent's own **browser** tool (agent reads pages in chat). ChromeControl runs inside the user's action at runtime.

## P4 pick

| need | pick |
|------|------|
| Control user's browser tab / page DOM | **sys:chromecontrol** (this topic) |
| Embedded HTML window in action UI | **sys:webview2** + **webview2-authoring** |
| HTTP API only (no browser) | **sys:http** |
| Parse static HTML text | **sys:htmlExtract** |

Requires Quicker browser extension connected (MV3). First step binds foreground browser or use `SetBrowser`.

## Standard flow

1. **OpenUrl** or **ActivateTab** → save `tabId` output variable
2. Optional **WaitTabComplete** / **Wait** (dynamic pages)
3. **GetElementInfo** / **UpdateElement** / **TriggerEvent** / **RunScript**
4. Read **rawResponse** (JToken) or typed outputs (`url`, `title`, …)

Reuse `tabId.var` across steps; empty `tabId` = active tab.

## P5 — common operations (wire)

After `step_runner_get({ key: "sys:chromecontrol", controlField: "<Operation>" })`:

| operation | purpose | key inputs |
|-----------|---------|------------|
| OpenUrl | Open URL, get tabId | `url`, `windowId`, `waitComplete` |
| ActivateTab | Switch to tab or open URL | `url` or `tabId` |
| WaitTabComplete | Wait page load | `tabId`, `timeoutMs` |
| GetTabInfo | Tab metadata | `tabId` |
| RunScript | JS in page | `script`, `executionWorld` (`MAIN`/`USER_SCRIPT`), `frame` |
| GetElementInfo | Read element | `selector`, `elementInfo`, `tabId.var` |
| UpdateElement | Set input/value | `selector`, `updateElementInfo`, `updateElementValue` |
| TriggerEvent | Click / change | `selector`, `triggerEventType` |
| Wait | Wait DOM change (MV3) | `selector`, `waitEventType`, `timeoutMs` |
| RunBackgroundCommand | Browser API once | `backgroundCommand`, `backgroundCommandArgs` |
| SetBrowser | Pin browser for action | `browser` (`chrome` / `msedge` / …) |

Selectors: CSS; prefix `xpath:` for XPath. Link steps with `tabId` / `tabId.var`.

## MV3 constraints

| constraint | action |
|------------|--------|
| RunScript | Extension needs **Allow user scripts** (Chrome 138+) or dev mode (older) |
| Background scripts (legacy) | Use **RunBackgroundCommand** (`api_*`, `scripts_*`) instead |
| Restricted pages | `chrome://`, extension store, `file://` default blocked |
| Message payload | Complex objects → JToken; script returns array per frame |

## Background commands

`RunBackgroundCommand` with `backgroundCommand` e.g. `api_tabs_create`, `api_tabs_query`. Args = JSON or `$=` object. See KC doc or extension built-in **后台命令参考**.

## Troubleshooting

| symptom | check |
|---------|--------|
| Quicker not connected | Extension popup: both links green; Quicker running |
| RunScript timeout | Set `frame` to `0` (main frame only); enable user scripts |
| Wrong browser | Add **SetBrowser** before first op, or focus target browser window |

## Deep reference

- Patch JSON examples: `docs({ action: "get", topic: "step-modules", reference: "chromecontrol" })`
- Full KC text: `reference: "kc/chromecontrol"`
- Thin wire notes: `reference: "chromecontrol"`

## Related

chromecontrol · step-runner-get · expressions · implementation-fallback · http · webview2-authoring
