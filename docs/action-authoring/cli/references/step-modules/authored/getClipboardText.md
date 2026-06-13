# sys:getClipboardText

> **分类**：剪贴板 · **来源**：仓库手写 · **官方**：[getclipboardtext](https://getquicker.net/KC/Help/Doc/getclipboardtext)

**用途**：按格式读取剪贴板文本（纯文本/HTML/RTF/CSV/自定义格式）。

## 示例

### Unicode 纯文本

```json
{
  "stepRunnerKey": "sys:getClipboardText",
  "outputParams": {
    "isSuccess": "成功",
    "output": "剪贴板文本"
  }
}
```

### 读取 HTML 并清理

```json
{
  "stepRunnerKey": "sys:getClipboardText",
  "inputParams": {
    "format": "Html"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "原始HTML",
    "cleanHtml": "纯文本"
  }
}
```

## 陷阱

- 默认 `format: UnicodeText`；HTML 模式额外输出 `cleanHtml`（Fragment 区间）与 `htmlDoc`（可存 `.html`）；网页复制可能带 `url` 来源。
- `waitMs` 非 0 时每 50ms 重试直到读到文本（适合配合模拟复制）；`Custom` 格式需填 `customFormat` + `encoding`。
- 写入剪贴板用 `writeClipboard`；监听变更用 `waitClipboardChange`。

## 相关

writeClipboard · waitClipboardChange · htmlExtract · getSelectedText · step-runner-get
