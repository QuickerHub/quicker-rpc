# sys:outputText

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[outputtext](https://getquicker.net/KC/Help/Doc/outputtext)

**用途**：向当前焦点窗口发送文本（模拟键入或剪贴板粘贴）。

## 示例

### 模拟键入

```json
{
  "stepRunnerKey": "sys:outputText",
  "inputParams": {
    "content.var": "要输入的文本",
    "method": "input"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 粘贴模式

```json
{
  "stepRunnerKey": "sys:outputText",
  "inputParams": {
    "content.var": "长文本",
    "method": "paste",
    "delayBeforePaste": 100
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- 默认 `method: paste`（写剪贴板 + Ctrl+V）；大段文本用 paste，短文本/特殊键用 `input` + `delayBetweenChar` 防乱序。
- `appendReturn: true` 末尾发送回车（聊天发送、换行）；`hideInHistory` 隐藏 Win+V 剪贴板历史（paste 模式）。
- Excel/WPS 单元格编辑态下 paste 可能只改单格——先 `keyInput` 发 Esc；复杂序列用 `inputScript`/`sendKeys`。

## 相关

getSelectedText · writeClipboard · keyInput · inputScript · imeControl · step-runner-get
