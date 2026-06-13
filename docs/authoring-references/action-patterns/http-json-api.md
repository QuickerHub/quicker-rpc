# HTTP GET + JSON 字段提取

> **场景**：调用 REST API 取 JSON · **难度**：S · **exemplar**：[公网IP](99363ea4-da49-4667-95d6-08d66293b929)（库，HTTP+提取+写剪贴板）· KC [http](https://getquicker.net/KC/Help/Doc/http)

## 何时用

动作需请求 HTTP(S) 接口并读取 JSON 响应中的字段。与 **expression-first** 的区别：本模式用 `http` + `jsonExtract` 模块链；单字段简单 JSON 可优先 `$=` + `JsonConvert`（见 expressions skill）。

## 步骤骨架

1. **请求** — `sys:http`，`method: GET`（或 POST + `bodyType`/`body`）
2. **提取** — `sys:jsonExtract`，`data` ← `content` 输出，`p0`…`p4` 为路径
3. **后续** — `sys:assign` / `sys:evalexpression` / 分支 `sys:simpleIf`（按需）

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 响应正文 | `respBody` / `httpText` | Text |
| HTTP 成功 | `httpOk` | Boolean |
| 状态码 | `statusCode` | Number |
| 提取字段 | `author` / `field0`… | Any |

## 示例动作

- 库 exemplar `99363ea4-…`：`http GET` → `regexExtract` → `writeClipboard`（字段提取写法可换 `jsonExtract`）
- 学习验证 `__pattern_learning__http_json`：`GET https://httpbin.org/json` → 提取 `slideshow.author`

### 最小 patch

```json
{
  "replace": true,
  "variables": [
    { "key": "respBody", "defaultValue": "" },
    { "key": "author", "defaultValue": "" },
    { "key": "httpOk", "varType": "boolean", "defaultValue": "false" }
  ],
  "steps": [
    {
      "stepRunnerKey": "sys:http",
      "inputParams": {
        "url": "https://httpbin.org/json",
        "method": "GET",
        "resultType": "Text"
      },
      "outputParams": {
        "isSuccess": "httpOk",
        "content": "respBody",
        "statusCode": "statusCode"
      }
    },
    {
      "stepRunnerKey": "sys:jsonExtract",
      "inputParams": {
        "data.var": "respBody",
        "p0": "slideshow.author"
      },
      "outputParams": { "v0": "author", "isSuccess": "httpOk" }
    }
  ]
}
```

## 陷阱

- `http.resultType` 须与响应一致；JSON API 用 `Text`，下载文件用 `File`。
- `jsonExtract` 路径用点号层级或 JSONPath；数组用 `list:` 前缀（1.30.14+）。
- POST JSON 体：`bodyType: JSON`；勿在 `header` 手写 Content-Type（用模块字段）。
- 生产环境注意 `stopIfFail`、超时 `expireSeconds`、HTTPS `skipCertVerify` 仅在测试启用。

## 相关

http · jsonExtract · expressions · assign · simpleIf · delay-retry
