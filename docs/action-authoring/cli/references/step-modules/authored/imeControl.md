# sys:imeControl

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[imecontrol](https://getquicker.net/KC/Help/Doc/imecontrol)

**用途**：切换或查询输入法中英文状态，避免模拟按键时被 IME 干扰。

## 示例

### 禁用输入法

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "DISABLE"
  }
}
```

### 恢复输入法

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "RESTORE"
  }
}
```

### 查询状态

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "GET_STATE"
  },
  "outputParams": {
    "isEnabled": "是否中文"
  }
}
```

## 陷阱

- `operation`: `ENABLE`（中文）/ `DISABLE`（英文）/ `RESTORE`（恢复进入动作前状态）/ `GET_STATE`（仅查询，`isEnabled` 表示是否中文）。
- 典型模式：`DISABLE` → `sendKeys`/`keyInput` → `RESTORE`；仅在输入法已启用时有效。

## 相关

sendKeys · keyInput · inputScript · getActiveProcessInfo · step-runner-get
