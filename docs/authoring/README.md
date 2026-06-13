# 动作编写文档

维护者入口：管线地图 + 三棵树的职责边界。

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

运行时：`qkrpc guide get --topic overview --json`

返回总索引：[docs/README.md](../README.md)
