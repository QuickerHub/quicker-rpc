# Step runner search (`step_runner_search`)

> **qkrpc MCP:** keyword uses **whitespace AND** matching (all tokens must appear). There is no `|` OR or `*` wildcard syntax yet — prefer the **`step-modules`** cheatsheet, then try several focused searches.

Use **`step_runner_search`** when **`step-modules`** has no match. Prefer **one keyword string** with advanced syntax instead of many separate searches.

## Syntax

| Feature | Syntax | Meaning |
|---------|--------|---------|
| **AND** (default) | `剪贴板 文本` | Both tokens must match (space / tab). Same as legacy behavior. |
| **OR** | `aaa\|bbb\|ccc` | Any branch may match. Split on `\|`. |
| **Wildcard** | `*clip*`, `sys:*` | `*` → any substring (case-insensitive regex). |
| **Combined** | `桌面\|图标\|desktop*\|icon` | OR of branches; `desktop*` is one token. |
| **Branch AND** | `剪贴板 文本\|clipboard text` | Left branch: both 剪贴板 and 文本; right branch: both English tokens. |

**Examples (single MCP call):**

```text
剪贴板|clipboard|getClipboard
桌面|图标|desktop|icon
sys:*clip*|write*board*
表达式|evalexpression|csscript
```

## Behavior

- **No `|` and no `*`**: legacy mode — all whitespace tokens must match (pinyin / FastMatcher on catalog text).
- **With `|` and/or `*`**: advanced mode — row matches if **any** branch matches; within a branch **all** tokens must match.
- **Wildcard tokens** use substring regex on the catalog match surface; other tokens still use FastMatcher.
- **Empty keyword**: browse top-level parent runners (MCP default list).

## Agent workflow

1. Draft OR branches from the user requirement (synonyms, English/Chinese, `sys:` key fragments).
2. Call **`step_runner_search` once** with e.g. `剪贴板|clipboard|sys:*clip*`.
3. **`step_runner_get`** on the best `key` from results — never guess param names.

## Related

`step-modules` · `implementation-fallback` · `overview`
