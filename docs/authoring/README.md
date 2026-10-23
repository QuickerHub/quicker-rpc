# 动作编写文档

维护者入口：管线地图 + 三棵树的职责边界。

现有 V1 动作的 CLI/独立 MCP 编辑从 `qkrpc guide get --topic program-source --json` 开始：
`action open` → 编辑 `program.source.yaml` / `files/` → `action save --dry-run` → `action save`。
YAML codec 负责源格式与规范 wire 的转换，V1 写回另做原生基线与并发检查。
V2 使用原生 MCP；QuickerAgent 的 `workspace_program`、新建、元数据和全局子程序保留原流程。

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

返回总索引：[docs/README.md](../README.md)
