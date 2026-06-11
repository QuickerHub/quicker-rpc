# sys:openUrl

> **来源**：step JSON 示例 · **官方**：[openurl](https://getquicker.net/KC/Help/Doc/openurl)

**用途**：用默认或指定浏览器打开 URL。

## 示例

### 默认浏览器打开

```json
{
  "stepRunnerKey": "sys:openUrl",
  "inputParams": {
    "url.var": "链接",
    "browser": "default"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### Chrome 打开

```json
{
  "stepRunnerKey": "sys:openUrl",
  "inputParams": {
    "url": "https://getquicker.net",
    "browser": "chrome"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
