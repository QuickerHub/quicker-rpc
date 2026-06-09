# sys:getSysInfo

> **来源**：step JSON 示例 · **官方**：[getsysinfo](https://getquicker.net/KC/Help/Doc/getsysinfo)

**用途**：读取 Windows / Quicker 系统与当前动作上下文信息。

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
