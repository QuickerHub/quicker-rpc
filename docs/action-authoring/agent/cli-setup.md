# Agent setup（agent-ui）
## P0 环境
Quicker 运行中且已加载 QuickerRpc 插件。推荐 `qkrpc serve`（agent-ui 优先 HTTP）。文档用 **`docs_get` / `docs_search` / `docs_index`** 本地工具，不经 qkrpc。

按需读文档（系统提示已含核心规则，勿在会话开头连续 `docs_get` 多篇全文）：

| 工具 | 用途 |
|------|------|
| `docs_index` | 列出全部主题 id |
| `docs_get` | `topic`: 如 `overview`、`authoring-workflow` |
| `docs_search` | `query`: 关键词检索主题 |

## 最小编辑链（P1→P6）

```text
qkrpc_action_list({ query: "keyword", scope?: "agent" })
qkrpc_action_get({ id: "guid", returnMode: "full" })
qkrpc_step_runner_get({ key: "stepRunnerKey" })
qkrpc_action_patch({ id: "<guid>", patch: { ... }, expectedEditVersion: <N> })
```

## 专题
`overview` · `authoring-workflow` · `patch-workflow` · `action-icons` · `xaction-json` · `variables` · `expressions` · `step-modules` · `step-runner-search` · `implementation-fallback`
