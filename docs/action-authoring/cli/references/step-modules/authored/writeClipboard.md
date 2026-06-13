# sys:writeClipboard

> **分类**：剪贴板 · **来源**：仓库手写 · **官方**：[writeclipboard](https://getquicker.net/KC/Help/Doc/writeclipboard)

**用途**：将文本、HTML、图片等写入剪贴板，或清空剪贴板。

## 示例

### 写入纯文本

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "text",
    "text.var": "内容"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 写入 HTML

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "html",
    "html.var": "HTML内容",
    "text.var": "纯文本备用"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 写入图片变量

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "image",
    "imageVar.var": "截图"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `type`: `auto`/`text`/`html`/`image`/`rtf`/`csv`/`custom`/`clear`/`clearHistory`；`auto` 用 `input` 自动识别。
- HTML 须同时提供 `text` 纯文本回退；读剪贴板用 `getClipboard`/`clipOperations`。
- 写步骤前 `get --control-field text` 等。

## 相关

getClipboard · waitClipboardChange · screenCapture · step-runner-get
