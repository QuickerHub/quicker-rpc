# sys:rhinocontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[rhinocontrol](https://getquicker.net/KC/Help/Doc/rhinocontrol)

**用途**：向 Rhino 发送命令或脚本（Rhino 须已运行）。

## 示例

### 执行 Rhino 命令（末尾空格触发执行）

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

### 执行脚本并取输出

```json
{
  "stepRunnerKey": "sys:rhinocontrol",
  "inputParams": {
    "operation": "RunScript",
    "command": "-_RunPythonScript \"print('hello')\"",
    "waitResp": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "脚本输出"
  }
}
```

## 陷阱

命令末尾通常需空格或回车才会开始执行；轮盘/手势中转请用 `runAction` 传参，勿直接对本模块写死命令。

## 相关

autocadcontrol · runAction · step-runner-get
