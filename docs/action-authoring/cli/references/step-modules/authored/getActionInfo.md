# sys:getActionInfo

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getactioninfo](https://getquicker.net/KC/Help/Doc/getactioninfo)

**用途**：读取当前运行动作或指定 ID 的动作元数据（标题、共享 ID 等）。

## 示例

### 按动作 ID 查询

```json
{
  "stepRunnerKey": "sys:getActionInfo",
  "inputParams": {
    "target": "byId",
    "actionId.var": "动作ID"
  },
  "outputParams": {
    "title": "动作名"
  }
}
```

### 读取当前运行动作

```json
{
  "stepRunnerKey": "sys:getActionInfo",
  "inputParams": {
    "target": "current"
  },
  "outputParams": {
    "title": "动作名",
    "sharedActionId": "共享ID"
  }
}
```

## 陷阱

- 部分环境 `qkrpc step-runner get --key sys:getActionInfo` 可能不可用；写步骤前以设计器/本 ref 为准，或 `quickeroperations` + `type: GetActionInfo` + `actionId` 作替代（输出键名为 `actionTitle` 等，勿混用）。
- `target: current` 无额外输入；`byId` 用 `actionId` / `actionId.var` 绑定 GUID。

## 相关

quickeroperations · getQuickerInfo · runAction · step-runner-get
