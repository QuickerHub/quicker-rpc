# sys:quickeroperations

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[quickeroperations](https://getquicker.net/KC/Help/Doc/quickeroperations)

**用途**：在动作中调用 Quicker 内置能力（面板、搜索、暂停、动作信息等）。

## 示例

### 显示 Quicker 面板

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "showPanel",
    "activatePointWindow": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 打开搜索框并填入关键词

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "showSearch",
    "searchText": "fa:chrome"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 暂停/恢复 Quicker

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "togglePause"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `type` 决定整步参数集——写步骤前 **`step-runner get --control-field <type>`**（如 `GetActionInfo`、`closeAllFloatWindow`）；禁止猜分支专有键名。
- `GetActionInfo` 用 `actionId`，输出 `actionTitle` 等（与独立 `getActionInfo` 模块键名可能不同）。
- 读 Quicker/动作上下文也可绑定 `getSysInfo` 输出（`isPaused`、`trigger` 等）。

## 相关

getSysInfo · getActionInfo · runAction · custompanel · step-runner-get
