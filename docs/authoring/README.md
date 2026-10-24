# 动作编写文档

维护者入口：管线地图 + 三棵树的职责边界。

现有 V1 动作的 CLI/MCP/QuickerAgent 编辑从 `program-source` 指南开始：
`action open` → 编辑 `program.source.yaml` / `files/` → `action save --dry-run` → `action save`。
YAML codec 负责源格式与规范 wire 的转换，V1 写回另做原生基线与并发检查。
QuickerAgent 用 `qkrpc_action_open/save` 和既有文件工具，显式 `dryRun:true` 后再 `false`；
V2 使用原生 MCP；`workspace_program` 兼容 JSON、新建、元数据和全局子程序保留原流程。

## 管线

[PIPELINE.md](PIPELINE.md) — src → `docs:gen` → 运行时消费者；常见错误与 skill 晋升。

```text
action-authoring-src/     手写模板 + manifest
authoring-references/     深参考（嵌入 AgentModel）
action-authoring/cli/     生成物（qkrpc guide get）
docs/skills/              生成物（agent setup / QuickerAgent）
```

## 三棵树（当前路径）

| 角色 | 路径 |
|------|------|
| 指南源码 | [`../action-authoring-src/`](../action-authoring-src/) |
| 深参考 | [`../authoring-references/`](../authoring-references/) |
| CLI 生成物 | [`../action-authoring/cli/`](../action-authoring/cli/) |
| Skill 生成物 | [`../skills/`](../skills/) |

命令：`npm run docs:gen` · `npm run docs:check`

修改 YAML 编辑知识：[`program-source.md`](../action-authoring-src/workflows/program-source.md)；
同步更新 `manifest/topics.json` / `operations.json` 和入口路由，再生成。

运行时：`qkrpc guide get --topic overview --json`

Node 的 `docs` 工具每次读取当前本地指南，并以同一次读取的正文构建搜索索引；返回的
`knowledge` 标明 `local-guide`、未知版本及实际加载 Markdown 的内容指纹。片段沿用其来源
正文的指纹，不把旧导出的 Markdown 当作当前宿主模块 schema，也不据此取得编辑权限。
schema 主题仅从已定位的仓库根或独立运行目录下
`docs/action-authoring-src/schemas/` 读取已包含的 JSON 资源；缺件或无效时仍可读取 Markdown，
但明确标记 schema `unavailable` / `unknown`，不隐式改查 serve、MCP 或网络。
需要当前 CLI guide 时仍可显式调用上述 `qkrpc guide get`；发布资源缺件不会被该入口自动补齐。

返回总索引：[docs/README.md](../README.md)
