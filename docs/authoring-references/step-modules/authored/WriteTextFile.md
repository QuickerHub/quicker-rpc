# sys:WriteTextFile

> **分类**：文件 · **来源**：仓库手写 · **官方**：[writetextfile](https://getquicker.net/KC/Help/Doc/writetextfile)

**用途**：将文本写入文件（覆盖或追加）。

## 示例

### 覆盖写入 UTF-8

```json
{
  "stepRunnerKey": "sys:WriteTextFile",
  "inputParams": {
    "content.var": "内容",
    "filePath.var": "文件路径",
    "encoding": "utf-8",
    "addUtf8Bom": false
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 追加一行

```json
{
  "stepRunnerKey": "sys:WriteTextFile",
  "inputParams": {
    "content.var": "日志行",
    "filePath.var": "日志文件",
    "appendMode": true,
    "addNewLine": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `encoding` 默认 `utf-8`；`default`=系统编码（中文 Windows 常为 GBK）。
- `appendMode` 追加；`newLineChars` 统一换行为 `\r\n`/`\n` 等；读取用 `readFile`。

## 相关

readFile · outputText · pathExtraction · step-runner-get
