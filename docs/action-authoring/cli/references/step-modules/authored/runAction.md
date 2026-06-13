# sys:runAction

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[runaction](https://getquicker.net/KC/Help/Doc/runaction)

**用途**：运行/停止其它 Quicker 动作，或显示动作右键菜单。

## 示例

### 运行动作并等待结果

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "StartAction",
    "actionId": "7521f699-fcab-43b9-9686-560de2c8aa92",
    "inputParam": "hello",
    "wait": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "actionTitle": "动作名称",
    "output": "动作输出"
  }
}
```

### 停止指定动作

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "StopAction",
    "actionId.var": "目标动作ID"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 显示动作右键菜单

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "ShowActionContextMenu",
    "actionId.var": "目标动作ID"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `actionId` 为 GUID 或**唯一**动作名；`inputParam` 写入被调动作的 `quicker_in_param`（`getSysInfo`/`getSelectedText` 的 `useActionParam` 可读）。
- 取子动作 `output` 须 `wait: true`；`StartCurrentAction` 勿递归；子程序调用用 `subprogram` 模块。
- 写步骤前 `get --control-field StartAction` 等过滤参数。

## 相关

subprogram · getSysInfo · getActionInfo · stop · step-runner-get
