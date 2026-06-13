# sys:stateStorage

> **分类**：数据 · **来源**：仓库手写 · **官方**：[statestorage](https://getquicker.net/KC/Help/Doc/statestorage)

**用途**：读写动作/全局持久状态，或更新动作徽标与右键菜单。

## 示例

### 读取状态

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "type": "readActionState",
    "key": "lastPath",
    "defaultValue": ""
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "值",
    "isEmpty": "为空"
  }
}
```

### 保存状态

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "type": "saveActionState",
    "key": "lastPath",
    "value.var": "路径"
  }
}
```

### 更新徽章

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "type": "UpdateActionBadge",
    "badgeText.var": "徽章文字",
    "badgeColor": "#FF5722",
    "badgeTextColor": "#FFFFFF"
  }
}
```

## 陷阱

- `type` 字段名在 get 中为 `type`（旧文档曾写 `operation`）；删除状态 `value` 填 `*NULL*`。
- `readGlobalState`/`saveGlobalState` 跨动作共享，谨慎使用；`inputIfEmpty` 空值时弹窗让用户输入。
- 写步骤前 `get --control-field readActionState` 等。

## 相关

showText · userInput · step-runner-get
