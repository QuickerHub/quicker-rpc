# sys:getQuickerInfo

> **来源**：step JSON 示例 · **官方**：[getquickerinfo](https://getquicker.net/KC/Help/Doc/getquickerinfo)

**用途**：读取 Quicker 版本、主题与触发上下文（本机 `step-runner get` 可能不可用）。

## 示例

### 读取版本与触发方式

```json
{
  "stepRunnerKey": "sys:getQuickerInfo",
  "outputParams": {
    "quickerVersion": "版本号",
    "trigger": "触发方式"
  }
}
```

### 读取主题模式

```json
{
  "stepRunnerKey": "sys:getQuickerInfo",
  "outputParams": {
    "quickerThemeMode": "主题模式",
    "isPro": "是否专业版"
  }
}
```
