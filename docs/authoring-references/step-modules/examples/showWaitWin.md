# sys:showWaitWin

> **来源**：step JSON 示例 · **官方**：[showwaitwin](https://getquicker.net/KC/Help/Doc/showwaitwin)

**用途**：显示或更新等待/进度提示窗口。

## 示例

### 显示等待窗

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "show",
    "title": "处理中",
    "prompt": "请稍候…",
    "progress": "30"
  },
  "outputParams": {
    "isClosed": "已关闭"
  }
}
```

### 更新进度

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "update",
    "prompt": "$$已完成 {进度}%",
    "progress.var": "进度"
  }
}
```

### 关闭等待窗

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "close"
  },
  "outputParams": {
    "isClosed": "已关闭"
  }
}
```
