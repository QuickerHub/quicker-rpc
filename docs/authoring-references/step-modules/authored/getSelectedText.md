# sys:getSelectedText

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[get_selected_text](https://getquicker.net/KC/Help/Doc/get_selected_text)

**用途**：获取前台窗口当前选中文本（默认模拟 Ctrl+C 读剪贴板）。

## 示例

### 获取纯文本

```json
{
  "stepRunnerKey": "sys:getSelectedText",
  "inputParams": {
    "format": "UnicodeText",
    "trim": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "选中文本"
  }
}
```

### 获取 HTML 并提取纯文本

```json
{
  "stepRunnerKey": "sys:getSelectedText",
  "inputParams": {
    "format": "Html",
    "waitMs": 500
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "原始HTML",
    "cleanHtml": "纯文本"
  }
}
```

## 陷阱

- 默认走剪贴板：会覆盖剪贴板；慢速软件（如 PDF）需增大 `waitMs`；失败场景见 KC [cannot_get_selected_text](https://getquicker.net/kc/help/doc/cannot_get_selected_text)。
- `tryNoClipboard: true` 用 UIAutomation，不污染剪贴板但兼容性差（Word 多单元格、Chrome 换行等）。
- `useActionParam: true` 时若动作有传入参数则直接作为 `output`，无参数才模拟复制；`outputEncoded` 为 URL 编码结果。

## 相关

getClipboardText · writeClipboard · outputText · textSelectTools · step-runner-get
