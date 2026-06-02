# qkrpc 命令参考

人类可读的 CLI 命令列表。机器可读版本：`qkrpc help --json`。

当前版本：**0.4.3** · 命名管道：`QuickerRpc_Server_QRPC2026`

## 通用约定

| 项 | 说明 |
|----|------|
| `--json` | 结构化 stdout，适合脚本与 Agent |
| 退出码 | `0` 成功，`1` 失败 |
| `--timeout N` | 连接与 RPC 超时（秒），默认 10（step-runner 默认 30） |
| `--no-bootstrap` | 跳过 `quicker:runaction` 自动拉起插件 |
| stdin | 大 JSON 可用 `--patch-file -` / `--xaction-file -` |

Agent 写动作流程：`guide get --topic authoring-workflow --json`（**勿**先 `ping`）  
公共子程序：`guide get --topic subprogram-workflow --json`

---

## 连接与指南

### `qkrpc help`

输出 CLI 自描述（Agent 优先读 `--json`）。

```powershell
qkrpc help --json
```

### `qkrpc guide get`

读取内置 ActionAuthoring 文档。

```powershell
qkrpc guide get --topic <id> [--json]
```

常用 topic：`authoring-workflow`、`patch-workflow`、`step-runner-search`、`implementation-fallback`

### `qkrpc guide search`

```powershell
qkrpc guide search [--query <keyword>] [--limit 10] [--json]
```

---

## 动作：创建与读写

### `qkrpc action create`

无头创建 XAction。自动使用 `@qkrpc` 虚拟动作页（页满自动扩页）；Agent 创建的动作不在 Quicker 场景树中显示，用 `action list --scope agent` 查找。

```powershell
qkrpc action create [--title <text>] [--description <text>] [--icon <spec>] [--profile-id <guid>] [--json]
```

返回 `actionId`、`editVersion`、`profileName`、`exeFile` 等。

### `qkrpc action get`

读取压缩 XAction 程序。

```powershell
qkrpc action get --id <guid> [--return-mode full|structure|metadata] [--json]
```

| return-mode | 用途 |
|-------------|------|
| `structure` | 步骤树、stepId，无 inputParams |
| `full` | 写 patch 前读非默认参数 |
| `metadata` | 标题、步骤概要 |

### `qkrpc action patch`

局部 patch，**一次调用 = 一次保存**。成功后以响应为准，勿仅为验证再 `action get`。

Patch JSON 除 `steps` / `variables` 外，可在**同一保存**中附带元数据字段：`title`、`description`、`icon`（省略的键不修改；`description` / `icon` 可传空字符串清空）。

```powershell
qkrpc action patch --id <guid> --patch-file <path|-> [--expected-edit-version N] [--force] [--json]
```

仅改图标示例：

```powershell
qkrpc action patch --id <guid> --patch "{\"icon\":\"fa:Light_Flask\"}" --expected-edit-version <N> --json
```

### `qkrpc action set-metadata`

只更新动作的**标题 / 说明 / 图标**，不修改步骤与变量程序体。

```powershell
qkrpc action set-metadata --id <guid> [--title <text>] [--description <text>] [--icon <fa:Light_Name>] [--expected-edit-version N] [--force] [--json]
```

| 选项 | 说明 |
|------|------|
| `--title` | 新标题（不可传空） |
| `--description` | 新说明；空字符串清空 |
| `--icon` | 完整 spec：`fa:Light_AddressBook` 或 `fa:Light_AddressBook:#3b82f6`（`names[]` 项 + `fa:` 前缀，见 action-icons） |

### `qkrpc action replace`

整体替换 steps/variables。

```powershell
qkrpc action replace --id <guid> --xaction-file <path|-> [--expected-edit-version N] [--force] [--json]
```

---

## 动作：搜索与列表

### `qkrpc serve`

本机桥接服务，**维持一条到 Quicker 命名管道的连接**，供 agent-gui 调用（避免每次 `spawn qkrpc`）。

```powershell
qkrpc serve [--host 127.0.0.1] [--port 9477] [--timeout 120] [--no-bootstrap]
```

| 端点 | 说明 |
|------|------|
| `GET http://127.0.0.1:9477/health` | 管道连通性（`Ping` + 协议版本） |
| `POST http://127.0.0.1:9477/v1/invoke` | JSON 体 `{ "op": "...", "args": { ... } }`（**agent-gui 默认**） |

`op` 与 agent-gui 工具一致：`guide.get`、`action.list`、`action.patch`、`fa.search` 等。消息体契约见 `QuickerRpc.AgentModel/Protos/agent_api.proto`（仅生成 model，线上为 camelCase JSON）。

### `qkrpc action list`

列出/筛选本地 XAction（Agent 摘要）。

```powershell
qkrpc action list [--query <keyword>] [--scope <scope>] [--limit 30] [--sort relevance|lastEdit|title] [--json]
```

无 `--query` 时默认 `--sort lastEdit`（全库按最后编辑时间取前 N 条）。有 `--query` 时默认按相关度排序。

### `qkrpc action search`

按 Quicker 主搜索框评分搜索。

```powershell
qkrpc action search --query <keyword> [--scope <scope>] [--limit 20] [--json]
```

### `--scope` 取值

| 值 | 含义 |
|----|------|
| `global` / `全局` | 全局面板 |
| `common` / `通用` | 通用面板 |
| `default` / `默认` | 默认面板 |
| `chrome` / `chrome.exe` | 指定进程下的动作页（含附加通用页） |
| `taskbar` / `desktop` | 任务栏 / 桌面 |
| `agent` / `qkrpc` | qkrpc 自动创建的虚拟页 |
| 动作页 GUID 或名称 | 指定单个动作页 |

列表/搜索响应含 `exeFile`、`profileName`、`profileId`。

---

## 动作：运维

### `qkrpc action run`

```powershell
qkrpc action run --id <idOrName> [--param <text>] [--debug] [--wait] [--json]
```

### `qkrpc action edit`

打开 Quicker 动作设计器 UI。

```powershell
qkrpc action edit --id <guid> [--json]
```

### `qkrpc action edit-var`

通过设计器 UI 修改变量默认值（支持公共子程序）。

```powershell
qkrpc action edit-var --id <id> --var <key> --value <val> [--json]
```

### `qkrpc action update`

上传/更新分享动作。

```powershell
qkrpc action update --id <sharedActionGuid> [--changelog <text>] [--json]
```

### `qkrpc action delete`

```powershell
qkrpc action delete --id <guid> --yes [--json]
```

---

## 步骤类型（StepRunner）

### `qkrpc step-runner search`

搜索步骤类型目录。空格 AND，`|` OR，`*` 通配。

```powershell
qkrpc step-runner search --query <keyword> [--limit 40] [--json]
```

### `qkrpc step-runner get`

读取步骤 schema。**写 patch 的 inputParams 前必查**，禁止猜键名。

```powershell
qkrpc step-runner get --key <stepRunnerKey> [--json]
```

---

## Font Awesome 图标

> **Agent 编辑链路**：`qkrpc guide get --topic overview --json`（P0–P7）→ `authoring-workflow`。图标：`action-icons`。

### `qkrpc fa search`

在 Quicker 已加载的 Font Awesome 目录中搜索图标。

**默认（压缩）**：Solid/Regular/Light 同图形合并为 **`Light_{图形id}`**；品牌为 **`Brands_{图形id}`**。`names[]` 为枚举名；写入时用 **`fa:{enumName}`** 或 **`fa:{enumName}:{#color}`**（见 `guide get --topic action-icons`）。

**`--expand`**：不合并，返回全部样式行（`Solid_*`、`Regular_*`、`Light_*` …）。`--all-styles` 同义。

```powershell
qkrpc fa search [--query <keyword>] [--limit 40] [--expand] [--json]
```

| 模式 | 说明 |
|------|------|
| 默认 | `Light_*` + `Brands_*`，每图形一条 |
| `--expand` | 全部样式枚举名 |
| `address book` | 默认 → `["Light_AddressBook"]`；expand → Solid/Regular/Light 各行 |

JSON 默认：`{ "names": ["Light_AddressBook"], "defaultStyle": "Light", "expand": false }` → 写入 `fa:Light_AddressBook` 或 `fa:Light_AddressBook:#rrggbb`  
JSON expand：`{ "names": ["Solid_AddressBook", "Regular_AddressBook", "Light_AddressBook"], "expand": true }`

---

## 子程序

### `qkrpc subprogram search` / `list`

搜索或列出公共子程序。响应含 **`callIdentifier`**（供 `sys:subprogram` 步骤使用）。

```powershell
qkrpc subprogram search --query <keyword> [--limit 20] [--json]
qkrpc subprogram list [--query <keyword>] [--limit 30] [--json]
```

### `qkrpc subprogram create`

```powershell
qkrpc subprogram create --name <name> [--description <text>] [--icon <spec>] [--json]
```

### `qkrpc subprogram get` / `patch` / `replace`

无头读写公共子程序（patch 语法与 `action patch` 相同）。

```powershell
qkrpc subprogram get --id <idOrName> [--return-mode full|structure|metadata] [--json]
qkrpc subprogram patch --id <idOrName> --patch-file <path|-> [--expected-edit-version N] [--json]
qkrpc subprogram replace --id <idOrName> --program-file <path|-> [--json]
```

### `qkrpc subprogram edit` / `edit-var` / `delete`

```powershell
qkrpc subprogram edit --id <idOrName> [--json]
qkrpc subprogram edit-var --id <idOrName> --var <key> --value <val> [--json]
qkrpc subprogram delete --id <idOrName> --yes [--json]
```

在动作中调用公共子程序：见 [subprogram-workflow](action-authoring/subprogram-workflow.md) 或 `guide get --topic subprogram-workflow --json`。

---

## 诊断（可选）

### `qkrpc ping`

手动检测插件是否在线（**非** Agent 编辑链路步骤；agent-gui 用 `serve` + `/health` 或页头状态）。

```powershell
qkrpc ping [--json] [--timeout 10] [--no-bootstrap]
```

---

## 常用示例

```powershell
# 环境（推荐）
qkrpc help --json
qkrpc serve   # 另开终端；GET http://127.0.0.1:9477/health

# 新建动作（Agent）
qkrpc action create --title "我的动作" --json

# 在 Chrome 场景下搜索
qkrpc action search --scope chrome --query "复制" --json

# 列出 agent 虚拟页上的动作
qkrpc action list --scope agent --json

# 无头写动作
qkrpc action get --id <guid> --return-mode full --json
qkrpc step-runner get --key sys:MsgBox --json
qkrpc fa search --query "clipboard" --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json

# 运行与发布
qkrpc action run --id "我的动作" --wait --json
qkrpc action update --id <sharedGuid> --changelog "说明" --json
```

---

## 安装 CLI

从 [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) 下载 **`qkrpc-win-x64-setup.exe`** 并运行（推荐）。

安装后新开终端。插件需在本机 Quicker 中加载 [QuickerRpc 分享动作](https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe) 并至少运行一次。

更多见 [README](../README.md) 与 [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases)。
