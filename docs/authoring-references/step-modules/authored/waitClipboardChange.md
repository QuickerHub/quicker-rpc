# sys:waitClipboardChange

> **分类**：自动化 · **来源**：仓库手写 · **官方**：[waitclipboardchange](https://getquicker.net/KC/Help/Doc/waitclipboardchange)

**用途**：阻塞等待剪贴板内容发生变化（如截图工具写入后）。

## 示例

### 等待剪贴板更新

```json
{
  "stepRunnerKey": "sys:waitClipboardChange",
  "inputParams": {
    "maxWaitSeconds": 10,
    "recentChangeMs": 10
  },
  "outputParams": {
    "isSuccess": "是否改变"
  }
}
```

### 结合等待窗口

```json
{
  "stepRunnerKey": "sys:waitClipboardChange",
  "inputParams": {
    "maxWaitSeconds": 30,
    "monitorWaitWin": true
  },
  "outputParams": {
    "isSuccess": "是否改变"
  }
}
```

## 陷阱

- `isSuccess=false` 表示超时未变化；`recentChangeMs` 包含此前 N 毫秒内的变更。
- `monitorWaitWin` 与 `showWaitWin` 配合，用户关等待窗则取消等待；超时 `stopIfFail` 控制是否停动作。

## 相关

showWaitWin · getClipboard · clipOperations · step-runner-get
