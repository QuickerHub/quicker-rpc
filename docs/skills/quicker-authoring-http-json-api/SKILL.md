---
name: quicker-authoring-http-json-api
description: "Quicker HTTP+JSON：sys:http 请求 → sys:jsonExtract 取字段。写 REST 调用、API 集成、JSON 字段读取动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# HTTP + JSON 提取（quicker-authoring-http-json-api）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`docs/authoring-references/action-patterns/http-json-api.md`

## 何时加载

动作需 HTTP(S) 请求 JSON API 并取出响应字段。单字段极简 JSON 可先评估 **quicker-eval-expression**（`JsonConvert`）。

## 步骤骨架

1. `sys:http` — `url` + `method`；GET 默认；POST 配 `bodyType`/`body`
2. `sys:jsonExtract` — `data.var` ← `content`；`p0`…`p4` 路径 → `v0`…`v4`
3. 可选：`simpleIf` 判 `statusCode` / `assign` 组装结果

## 硬规则（本场景）

- GET：`step_runner_get --control-field GET`；POST 再 get POST 分支。
- `resultType: Text` 用于 JSON 字符串；勿猜 output 键名。
- `jsonExtract` 前确认 `http.content` 已写入变量（`content` → `respBody` 等）。
- 简单单字段优先表达式；本 skill 用于多路径或需 `rootToken` 续取。

## 变量约定

| 角色 | key |
|------|-----|
| 响应体 | `respBody` |
| 提取值 | `author` / `field0` |
| 成功 | `httpOk` |

## 陷阱

- 请求头勿手写 Content-Type（POST 用 `bodyType`）。
- 数组路径加 `list:` 前缀；失败检查 `stopIfFail` 与超时。

## 深度阅读

- `action-patterns/http-json-api.md`
- authored: http · jsonExtract · expressions

