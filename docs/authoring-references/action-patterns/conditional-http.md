# 条件 HTTP 请求

> **场景**：动作变量 url 非空才 GET，否则提示 · **难度**：M · **exemplar**：`__pattern_learning__conditional_http` trace ✅

## 何时用

HTTP 地址来自用户输入/表单/上游变量，需**守卫空值**再发请求。与 **http-json-api** 的区别：本模式强调 **if 分支 + 可选 url**；与 **path-and-exists** 的区别：守卫的是字符串非空而非路径存在。

## 步骤骨架

1. **声明** — `url`、`body`/`message` 变量
2. **分支** — `sys:if`（含 else 且 else 多步时用 **if**，勿用 simpleIf 跳过 else）
3. **空 url** — `evalexpression` / `MsgBox` 提示
4. **非空** — `sys:http` `url.var` + GET → `content` → `body`
5. **收尾** — `showText` / 下游解析

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 请求地址 | `url` | Text |
| 响应体 | `body` / `respBody` | Text |
| 用户提示 | `message` | Text |
| HTTP 成功 | `ok` / `httpOk` | Boolean |

## 示例（trace ✅）

`url=https://httpbin.org/get` → else 分支 HTTP → `HTTP_OK:{...}`

Patch：`.local/patch-conditional-http.json`

### 最小 patch

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": { "condition": "$=string.IsNullOrWhiteSpace({url})" },
  "ifSteps": [
    {
      "stepRunnerKey": "sys:evalexpression",
      "inputParams": { "expression": "{message} = \"请先设置 url\";" }
    }
  ],
  "elseSteps": [
    {
      "stepRunnerKey": "sys:http",
      "inputParams": { "url.var": "url", "method": "GET", "resultType": "Text" },
      "outputParams": { "content": "body", "isSuccess": "ok" }
    }
  ]
}
```

## 陷阱

- **else 含 http 等多步**：用 **`sys:if`** + `elseSteps`；`simpleIf` 在条件为 False 时可能**不执行 else**（实测跳过整步）。
- 空判断：`$=string.IsNullOrWhiteSpace({url})`；表达式内用 `{url}`。
- `url.var` 绑定变量；字面量 url 直接写 `url` 键。
- 需要 **else 两分支** 且仅单步 each → 可试 `simpleIf`；否则统一 `sys:if`。

## 相关

http-json-api · path-and-exists · simpleIf · http · skill：`quicker-authoring-conditional-http`
