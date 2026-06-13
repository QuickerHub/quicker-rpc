# sys:delay

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[delay](https://getquicker.net/KC/Help/Doc/delay)

**用途**：暂停动作执行指定毫秒。

## 示例

### 延迟 500ms

```json
{
  "stepRunnerKey": "sys:delay",
  "inputParams": {
    "delayMs": 500
  }
}
```

### 长延迟并监控等待窗

```json
{
  "stepRunnerKey": "sys:delay",
  "inputParams": {
    "delayMs": 3000,
    "monitorWaitWin": true
  }
}
```

## 陷阱

- 单参数 `delayMs`；`monitorWaitWin` 与 `showWaitWin` 配合，用户关等待窗则提前结束（通常需 delay > 1000ms）。
- `step-runner get` 已够写步骤；本 ref 供 JSON 示例与 `docReference`。

## 相关

showWaitWin · repeat · step-runner-get
