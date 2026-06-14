# Event trigger workflow
<!-- qkrpc-search-aliases: trigger, 事件触发, 事件动作, 触发条件, 自动运行, 自动触发, quicker_trigger, BrowserUrlChanged, WindowActivated, WindowDeactivated, ProcessStarted, ProcessExited, ClipboardChanged, FileSystemChange, Repeat, IdleTimeExpire, IdleEnd, BusyTimeExpire, 网址, 网页, URL, 标签页, 窗口焦点, 获得焦点, 失去焦点, 进程启动, 进程退出, 剪贴板, 文件监控, 目录监控, 定时, 定时重复, 空闲, 闲置, 蓝牙, 网络连接, U盘, 磁盘插入, filter, UrlPattern, 附加过滤, 事件类型 -->

**When**: auto-run a Quicker action on system events (场景 → 事件动作). Maps to `UserSettings.TriggerTasks`. **NOT** run now (`qkrpc_action_run`) or edit program body (`workspace_program`).

## Checklist (Tr0–Tr5)

```text
- [ ] Tr0  target action exists and is tested (qkrpc_action_debug) — NOT workspace_program for trigger wiring
- [ ] Tr1  action=events — read eventType, fields[].key/helpText/type/selectionItems, variables[].key
- [ ] Tr2  build params (触发条件) — keys from fields only; Text/Boolean/Integer/Enum rules below
- [ ] Tr3  optional filter ($= bool on variables) or actionParam ($$ interpolation)
- [ ] Tr4  action=add (confirm broad rules with user) — or update/delete/enable/disable by id
- [ ] Tr5  action=list to verify; bind variables[].key into action steps (e.g. tabId.var)
```

## Concepts

| concept | meaning |
|---------|---------|
| eventType | Case-sensitive id (`BrowserUrlChanged`, `WindowActivated`, `Repeat`, …) |
| params | **触发条件** — subscription criteria; JSON keys from `events` → `fields[].key` |
| filter | **附加过滤** — optional `$=` boolean on `events` → `variables[].key` at fire time |
| variables | Event output passed to the triggered action (and used in filter / `actionParam`) |
| actionParam | Static `quicker_in_param`; may use `$$` to inject `{VarName}` from variables |

Two layers: **params** narrow which events are watched; **filter** refines individual occurrences. Prefer params; add filter only when params cannot express the rule.

## Pick eventType (intent → event)

Match user intent to **one** `eventType` (case sensitive). Then `action=events` with that `eventType` for `fields` / `variables`.

| User intent (zh / en) | eventType | Key params |
|-----------------------|-----------|------------|
| 浏览器网址变化 / 打开网页 / URL / tab / GitHub page | `BrowserUrlChanged` | `UrlPattern`, `OnlyActiveTab` |
| 窗口获得焦点 / 切换到某应用 / foreground / VS Code focus | `WindowActivated` | `ProcessName`, `WindowTitle`, `WindowClass`, `ProcChangeCondition` |
| 窗口失去焦点 / background | `WindowDeactivated` | same as WindowActivated |
| 进程启动 / app started / 打开程序 | `ProcessStarted` | `ProcessName` (required) |
| 进程退出 / app closed | `ProcessExited` | `ProcessName` (required) |
| 剪贴板变化 / copy paste / clipboard | `ClipboardChanged` | `ContentType`, `TextPattern`, `ProcessName` |
| 文件创建修改删除 / 目录监控 / file watch | `FileSystemChange` | `Path`, `Filter`, `WatchCreated`… + `throttleMs` |
| 定时 / 每隔 N 秒 / timer / cron-like | `Repeat` | `RepeatInternval`, `MaxRepeatCount` |
| 空闲一段时间 / idle / 无人操作 | `IdleTimeExpire` | `ExpireSeconds`, `InputMethod`, `RepeatInternval` |
| 结束空闲 / 恢复操作 | `IdleEnd` | `ExpireSeconds`, `InputMethod` |
| 连续使用过久 / busy | `BusyTimeExpire` | `ExpireSeconds`, `IdelResetSeconds`, `RepeatInternval` |
| 网络连接 / WiFi 连接 | `NetworkConnected` | `NetworkName`, `MinConnectivityLevel` |
| 网络断开 | `NetworkDisconnected` | (no params) |
| U盘插入 / 磁盘插入 / USB drive | `DriveInserted` | `DriveLetter`, `DriveVolumeLabel` |
| 蓝牙连接/断开/进入范围/离开 | `BluetoothDeviceConnected` / `Disconnected` / `InRange` / `OutOfRange` | `DeviceName` |
| 音频设备插入/拔出 | `AudioDeviceActive` / `AudioDeviceUnplugged` | `DeviceName` |
| 大小写锁定等按键灯 | `KeyToggled` | `Key` |
| 电源模式 / 插电拔电 | `PowerModeChanged` | (no params) |
| 锁屏 / 解锁 | `SessionLock` / `SessionUnlock` | (no params) |
| 注销关机前 | `SessionEnding` | (no params) |
| 显示器设置变化 | `DisplaySettingsChanged` | (no params) |

Unsure? `quicker_trigger({ action: "events" })` lists all types; add `query` with a keyword (e.g. `网址`, `clipboard`, `file`) to filter the catalog in the tool response.

Existing rule? `quicker_trigger({ action: "list", query: "<keyword>" })` — matches note, eventType, action name/id.

## Tr0 Prerequisites

- Quicker + QuickerRpc plugin loaded.
- Target action exists (create/edit via **authoring-workflow** first).
- Smoke-test the action: qkrpc action run --id <guid> --trace --json.

## Tr1 Discover schema (required before add/update)

```powershell
qkrpc trigger events [--event BrowserUrlChanged] --json
```

Response fields to read:

| path | use |
|------|-----|
| `items[].eventType` | copy exactly into `eventType` |
| `items[].fields[]` | **params** keys + how to write values |
| `fields[].key` | param key (case sensitive; legacy typos: `RepeatInternval`, `IdelResetSeconds`) |
| `fields[].helpText` | authoritative value hints — read per key |
| `fields[].type` | `Text` / `Boolean` / `Integer` / `Enum` |
| `fields[].selectionItems` | Enum options: `label\|VALUE` — use **VALUE** |
| `fields[].defaultValueJson` | default when omitting optional keys |
| `items[].variables[]` | runtime vars for filter + action binding |
| `variables[].key` | reference in filter as `{Key}` and in `actionParam` as `$$…={Key}` |

**Never guess** param keys — always from `events` output.

## Tr2 Write params (触发条件)

Build a JSON object for tool field `params` / CLI `--params '{...}'`.

### Value rules (all event types)

| type | how to write |
|------|----------------|
| **Text** | Single value **or** semicolon-separated alternatives **or** `regex:<pattern>`. Matching is case-insensitive for plain values. All non-empty params must match (**AND**). |
| **Boolean** | `true` / `false` |
| **Integer** / **Number** | Numeric (e.g. `RepeatInternval` = seconds) |
| **Enum** | Value after `\|` in `selectionItems` (e.g. `ProcChangeCondition`: `NA`, `Pid`, `ProcName`) |

### Common examples

| eventType | params example | notes |
|-----------|----------------|-------|
| `BrowserUrlChanged` | `{ "UrlPattern": "https://github.com", "OnlyActiveTab": true }` | `UrlPattern` = URL **prefix** (not bare regex); multi: `url1;url2`; regex: `regex:github\\.com`. Needs browser extension. |
| `WindowActivated` | `{ "ProcessName": "code;devenv", "WindowTitle": "", "ProcChangeCondition": "NA" }` | `WindowTitle` / `WindowClass` / `ProcessName` support `regex:`. |
| `ProcessStarted` | `{ "ProcessName": "notepad" }` | |
| `ClipboardChanged` | `{ "ContentType": "TEXT", "TextPattern": "regex:..." }` | `ContentType`: `ALL`, `TEXT`, `HTML`, `IMAGE`, `FILE`, `CUSTOM`. |
| `Repeat` | `{ "RepeatInternval": 60, "MaxRepeatCount": 0 }` | `MaxRepeatCount` 0 = unlimited. |
| `FileSystemChange` | `{ "Path": "D:\\\\watch", "Filter": "*.*", "WatchCreated": true, "IncludeSubdirectories": true }` | Pair with `throttleMs` (e.g. 1000). |

`update`: passing `params` **replaces** the whole object.

## Tr3 Optional filter & actionParam

### filter (附加过滤)

Quicker `$=` expression returning **boolean**; `true` = allow fire. Reference event variables by `{VarName}` from `variables[].key`.

Examples:

```text
$={Url}.Contains("issue")
$=!String.IsNullOrEmpty({cliptext}) && {cliptext}.Length > 10
```

Omit when params already narrow enough.

### actionParam

Passes text as `quicker_in_param` to the triggered action. Inject event data:

```text
$$Url={Url}&TabId={TabId}
$$FullPath={FullPath}&ChangeType={ChangeType}
```

Bind variables into action steps (e.g. `sys:chromecontrol` `tabId.var` = `TabId`) — see **chromecontrol-authoring** / **quicker-browser-script**.

## Tr4 Create or update rule

Required for **add**: `eventType`, `actionIdOrName` (Guid or unique title). Resolve id: qkrpc action search --query "name" [--scope agent] --json.

```powershell
qkrpc trigger add --event BrowserUrlChanged --action <guid> `
  --params '{"UrlPattern":"https://github.com","OnlyActiveTab":true}' `
  --note "GitHub auto script" --json
```

| optional field | when |
|----------------|------|
| `enabled: false` | create disabled |
| `delayMs` | wait after event (e.g. 800 ms for slow UI) |
| `debounceMs` / `throttleMs` | suppress noisy repeats (`FileSystemChange`) |
| `skipFurtherTasks: true` | stop later rules on same event (avoid on `Repeat` / idle / file watch) |
| `validForMachines` | `host1;host2` binding |

**Confirm with user** before broad rules (wide `UrlPattern`, short `Repeat` intervals, enabled file watchers).

## Tr5 Manage rules

| intent | action |
|--------|--------|
| search existing | `list` + `query` keyword |
| disable / enable | `disable` / `enable` + `id` from list |
| patch fields | `update` + `id` (only set fields to change) |
| delete | `delete` + `id` — **only when user explicitly asks** |

Free edition: Quicker UI honors at most **2** trigger rules (warnings on add).

## Common flows

**W1 Page script auto-run**: authoring P1–P7 → user_browser prototype → **trigger-workflow** Tr1–Tr4 `BrowserUrlChanged` → bind `TabId` in action.

**W2 App focus hook**: Tr1 `WindowActivated` → params `ProcessName` + optional `WindowTitle` → add.

**W3 Timer**: Tr1 `Repeat` → params `RepeatInternval` / `MaxRepeatCount` → add (confirm interval with user).

## Errors

| symptom | fix |
|---------|-----|
| guessed param key / wrong case | Tr1 — re-run `events`; use `fields[].key` |
| `RepeatInternval` typo rejected | use exact legacy key from `events` |
| UrlPattern as bare regex | use URL prefix or `regex:` prefix |
| action not found warning | verify Guid via `qkrpc_action_query` |
| rule never fires | check `enabled`, params too narrow, extension for `BrowserUrlChanged` |
| too many fires | add `throttleMs` / tighten params / optional `filter` |

## Related

overview · authoring-workflow · chromecontrol-authoring · expressions · quicker-browser-script · cli-commands (trigger section)
