# sys:runAction

> **来源**：step JSON 示例 · **官方**：[runaction](https://getquicker.net/KC/Help/Doc/runaction)

**用途**：运行、停止或显示其它 Quicker 动作的右键菜单。

## 示例

### 运行动作并等待结果

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "StartAction",
    "actionId": "7521f699-fcab-43b9-9686-560de2c8aa92",
    "inputParam": "hello",
    "wait": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "actionTitle": "动作名称",
    "output": "动作输出"
  }
}
```

### 按名称启动（不等待）

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "StartAction",
    "actionId": "我的子动作",
    "inputParam.var": "命令参数"
  },
  "outputParams": {
    "isSuccess": "成功"
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
