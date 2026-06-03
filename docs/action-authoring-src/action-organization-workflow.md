# 动作整理与位置调整

**何时读**：整理全局动作页、移动动作到指定格子、调整 tab 顺序、按子程序引用批量归集、为虚拟进程创建专用动作页。**不**改程序体（步骤/变量）——改内容见 **`authoring-workflow`**。

## 概念速览

| 概念 | 说明 |
|------|------|
| **动作页（profile）** | Quicker 左侧/顶部的 tab；全局页 `scope=global`，首 tab 常为 `_global` |
| **scope** | `global`、虚拟进程键（如 `_ceacore_run`）、或应用 exe 键；list/search 的 `scope` 见工具说明 |
| **格子 (row, col)** | 动作在页内网格位置；省略 row/col 时移到**第一个空位** |
| **虚拟进程** | `ExeFile` 以 `_` 开头；在「场景与动作管理」显示为独立应用，可有专用动作页 |

## O1 发现：列出与搜索

```text
list / search（按名、scope）
  → uses:<子程序名>  找出调用某公共子程序的动作
  → uses-only:<名>   仅「专用包装」动作（单步调用该子程序）
```

{{#only-agent}}
```text
{{@ action.list scope=global}}
{{@ action.search query=uses:MySub}}
```

响应含 `profileId`、`profileName`、`row`、`col`——移动前记下当前位置与目标页 id。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.list scope=global}}
{{@ action.search query=uses:MySub}}
```
{{/only-cli}}

**UI 提示**：agent-gui 会在聊天里渲染动作表；勿在回复中重复整张 markdown 表，只总结数量与下一步。

## O2 移动单个动作

```text
action move --id <guid> --profile <profileId|profileName|scope>
  [--row N --col M]   # 指定格子；须同时提供
  [--swap]            # 目标格已有动作时交换（默认失败）
```

{{#only-agent}}
```text
{{@ action.move id=<guid> profile=_global}}
{{@ action.move id=<guid> profile=<profileId> row=0 col=1}}
```
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.move id=<guid> profile=_global}}
{{@ action.move id=<guid> profile=<profileId> row=0 col=1}}
```
{{/only-cli}}

| 场景 | 做法 |
|------|------|
| 移到某页第一个空位 | 只传 `profile` |
| 精确放到 (0,1) | `row` + `col` 一起传 |
| 与占用格交换 | 加 `swap: true`（用户接受覆盖时再开） |

## O3 全局动作页：新建与排序

**新建空白页**（常用于把 `_global` 上的动作迁出）：

{{#only-agent}}
```text
{{@ profile.create afterFirst=true count=1}}
```
`afterFirst: true` → 插在 `_global` **之后**（保留顶部保留位）。创建后 list `scope=global` 取新 `profileId`。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ profile.create afterFirst=true count=1}}
```
{{/only-cli}}

**调整已有 tab 顺序**（移到 `_global` 后面）：

{{#only-agent}}
```text
{{@ profile.reorder profileIds=[guid1,guid2,...]}}
```
`profileIds` 按期望从左到右顺序传入。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ profile.reorder profileIds=<guid1>,<guid2>}}
```
{{/only-cli}}

## O4 虚拟进程：创建页 + 批量归集

当动作用于某「虚拟应用」且应显示在其专用页时：

```text
process ensure --exe <_key> --name "<显示名>" --profile-prefix "<页名前缀> "
  [--collect-subprogram <子程序名> --move-actions [--move-any]]
```

| 参数 | 含义 |
|------|------|
| `exe` | 虚拟进程键，如 `_ceacore_run` |
| `profile-prefix` | 自动创建的动作页名前缀，如 `"@CeaCore "` |
| `collect-subprogram` + `move-actions` | 扫描调用该公共子程序的动作并移入新页 |
| `move-any` | 默认只移「专用包装」；加此开关移**任意**含该调用的动作 |

{{#only-agent}}
```text
{{@ process.ensure exe=_my_app name="My App" profile-prefix="@MyApp "}}
{{@ process.ensure exe=_my_app name="My App" profile-prefix="@MyApp " collect-subprogram=MySub move-actions=true}}
```
仅 ensure 进程/页、不移动作：省略 `move-actions`。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ process.ensure exe=_my_app name="My App" profile-prefix="@MyApp "}}
{{@ process.ensure exe=_my_app name="My App" profile-prefix="@MyApp " collect-subprogram=MySub move-actions=true}}
```
{{/only-cli}}

## 常见工作流

### W1 清空 `_global` 杂项

```text
1. profile create (afterFirst) → 新页 profileId
2. action list scope=global query=<关键词>  或人工从 UI @ 动作
3. 对每个 id：action move → 新 profileId（或指定 row/col 排版）
4. 可选：profile reorder 调整 tab 顺序
```

### W2 按子程序引用归类

```text
1. action search query=uses:<SubName>  （预览候选）
2. 若需虚拟进程页：process ensure + collect-subprogram + move-actions
3. 否则：profile create → 逐个 action move
4. uses-only:<SubName>  可筛出仅作入口的包装动作
```

### W3 修正 tab 顺序

```text
1. action list scope=global  → 收集 profileId / profileName
2. profile reorder profileIds=[期望顺序的 guid 列表]
```

### W4 虚拟进程首次接入（示例）

```text
process ensure --exe _ceacore_run --name "CeaCore Run" --profile-prefix "@CeaCore "
  --collect-subprogram CeaCore_Run --move-actions
```

之后零散动作仍可用 **O2** 微调格子；新增包装动作用 **W2** 的 search + move。

## 注意

- **移动 ≠ 编辑**：不改 `data.json`、不需要 `expectedEditVersion`。
- **destructive 无关**：move / profile / process ensure 可立即执行（无确认 UI）。
- 目标页不存在时先用 **O3** 或 **O4** 创建；虚拟进程页在 Quicker「场景与动作管理」左侧应可见（需插件写入 ExeSettings）。
- 批量移动前先用 **O1** 确认列表；`swap` 会交换占用格——仅在用户明确接受时使用。

## 相关

`overview` · `authoring-workflow` · `subprogram-workflow`
