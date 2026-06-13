# sys:waitKeyboard

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[waitkeyboard](https://getquicker.net/KC/Help/Doc/waitkeyboard)

**用途**：阻塞等待用户按下指定键或组合键。

## 示例

### 等待单键

```json
{
  "stepRunnerKey": "sys:waitKeyboard",
  "inputParams": {
    "operation": "waitKeyDown",
    "waitingKeys": "F9",
    "maxWaitSeconds": 0
  },
  "outputParams": {
    "isSuccess": "成功",
    "keyCode": "键名",
    "keyValue": "键码"
  }
}
```

### 等待组合键

```json
{
  "stepRunnerKey": "sys:waitKeyboard",
  "inputParams": {
    "operation": "waitKeyDown",
    "waitingKeys": "C",
    "modifierKeys": "Ctrl",
    "waitKeyUp": true
  },
  "outputParams": {
    "holdTimeMs": "按住时长"
  }
}
```

## 陷阱

- `operation`: `waitKeyDown`/`waitAllKeyUp`；`maxWaitSeconds` 0=无限等待；`filterEvent` 拦截按键不传入前台窗。
- `modifierKeys` 逗号分隔 `ctrl,shift,alt,win`；`liveRun: false`；超时 `stopIfFail` 停动作。

## 相关

keyInput · sendKeys · showWaitWin · step-runner-get
