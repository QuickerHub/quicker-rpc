# sys:comment

> **来源**：step JSON 示例 · **官方**：[comment](https://getquicker.net/KC/Help/Doc/comment)

**用途**：在步骤列表中插入说明性注释（无运行时副作用）。

## 示例

### 分组说明

```json
{
  "stepRunnerKey": "sys:comment",
  "inputParams": {
    "note": "以下步骤：下载并解压更新包"
  }
}
```

### 含参考链接

```json
{
  "stepRunnerKey": "sys:comment",
  "inputParams": {
    "note": "API 文档 https://example.com/docs — 右键注释可打开链接"
  }
}
```
