# sys:getQuickerInfo

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getquickerinfo](https://getquicker.net/KC/Help/Doc/getquickerinfo)

**用途**：读取 Quicker 版本、专业版状态、主题与当前动作触发上下文。

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

## 陷阱

- 部分环境 `qkrpc step-runner get --key sys:getQuickerInfo` 不可用；输出键名以本 ref / 设计器为准（如 `quickerVersion`、`trigger`、`isPro`）。
- 无输入参数；系统环境信息用 `getSysInfo`，动作元数据用 `getActionInfo` / `quickeroperations`。

## 相关

getSysInfo · getActionInfo · quickeroperations · step-runner-get
