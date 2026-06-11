# sys:rhinocontrol

> **来源**：step JSON 示例 · **官方**：[rhinocontrol](https://getquicker.net/KC/Help/Doc/rhinocontrol)

**用途**：向 Rhino 发送命令或脚本（Rhino 须已运行）。

## 示例

### 执行 Rhino 命令

```json
{
  "stepRunnerKey": "sys:rhinocontrol",
  "inputParams": {
    "operation": "RunScript",
    "command": "_Zoom _Extents "
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 执行脚本并等待输出

```json
{
  "stepRunnerKey": "sys:rhinocontrol",
  "inputParams": {
    "operation": "RunScript",
    "command": "-_RunPythonScript \"print('hello')\"",
    "waitResp": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "输出"
  }
}
```
