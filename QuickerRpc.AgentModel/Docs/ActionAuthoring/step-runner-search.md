# Step runner search (`qkrpc step-runner search`)

在 **`step-modules`** 速查表没有合适模块时使用。优先**一次**传入带 OR/通配符的关键词，不要拆成多次模糊搜索。

## 命令

```powershell
qkrpc step-runner search --query "剪贴板|clipboard|sys:*clip*" --limit 40 --json
```

响应 `payload.items[]`：`key`（即 `stepRunnerKey`）、`name`、`description`。选定 key 后必须 **`qkrpc step-runner get --key <key> --json`**。

## Syntax

| Feature | Syntax | Meaning |
|---------|--------|---------|
| **AND** (default) | `剪贴板 文本` | 所有 token 都要匹配（空格 / Tab） |
| **OR** | `aaa\|bbb\|ccc` | 任一分支匹配即可 |
| **Wildcard** | `*clip*`, `sys:*` | `*` 为子串（不区分大小写） |
| **Combined** | `桌面\|图标\|desktop*\|icon` | 多分支 OR；`desktop*` 为一个 token |
| **Branch AND** | `剪贴板 文本\|clipboard text` | 分支内 token 全部匹配 |

**Examples:**

```text
msgbox|消息|sys:*msg*
剪贴板|clipboard|getClipboard
sys:*clip*|write*board*
```

## Behavior

- 无 `|`、无 `*`：所有空格分隔 token 均须出现在 key/name/description 中。
- 有 `|` 和/或 `*`：任一分支满足即可；分支内 token 全部满足。
- **空 keyword**：按名称浏览（受 `--limit` 限制）。

## Agent workflow

1. 根据用户需求列出 OR 分支（中英文同义词、`sys:` 片段）。
2. **一次** `step-runner search`。
3. **`step-runner get`** 取 schema — **禁止**猜 `inputParams` 键名。

## Related

`authoring-workflow` · `step-modules` · `implementation-fallback` · `overview`
