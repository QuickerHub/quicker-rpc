# sys:comment

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[comment](https://getquicker.net/KC/Help/Doc/comment)

**用途**：步骤列表中的说明注释（无运行时副作用）。

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

## 陷阱

- 仅 `note` 文本；设计器里可折叠；不影响变量与执行顺序。

## 相关

group · step-runner-get
