# sys:getSysInfo

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getsysinfo](https://getquicker.net/KC/Help/Doc/getsysinfo)

**用途**：无输入一步读取 Windows 环境、Quicker 状态与当前动作运行上下文。

## 示例

### 读取系统与 Quicker 版本

```json
{
  "stepRunnerKey": "sys:getSysInfo",
  "outputParams": {
    "OsVersion": "系统版本",
    "quickerVersion": "Quicker版本",
    "isPro": "是否专业版"
  }
}
```

### 读取当前动作上下文

```json
{
  "stepRunnerKey": "sys:getSysInfo",
  "outputParams": {
    "actionId": "动作ID",
    "actionName": "动作名称",
    "trigger": "触发方式",
    "textParam": "文本参数"
  }
}
```

## 陷阱

- **无 inputParams**；输出键名 PascalCase/camelCase 混用（如 `OsVersion`、`actionId`），只绑定需要的项。
- 含动作上下文（`actionId`、`trigger`、`textParam`、`imageParam`）与 Quicker 状态（`isPro`、`quickerThemeMode`）；`sysEnv` 为环境变量词典。
- 仅需 Quicker 版本/主题时可读 `getQuickerInfo`（若可用）；窗口信息用 `getWindowTitle`。

## 相关

getQuickerInfo · getActionInfo · getActiveProcessInfo · getWindowTitle · step-runner-get
