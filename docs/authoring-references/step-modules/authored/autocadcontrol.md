# sys:autocadcontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol)

**用途**：向 AutoCAD 发送命令或读取文档变量（CAD 须已运行）。

## 示例

### 执行命令（Zoom All）

```json
{
  "stepRunnerKey": "sys:autocadcontrol",
  "inputParams": {
    "operation": "SendCommand",
    "command": "_zoom _all "
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 执行 AutoLISP 脚本

```json
{
  "stepRunnerKey": "sys:autocadcontrol",
  "inputParams": {
    "operation": "SendCommand",
    "command": "(alert \"Hello World\") "
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 读取文档变量

```json
{
  "stepRunnerKey": "sys:autocadcontrol",
  "inputParams": {
    "operation": "ReadVariable",
    "varList": "DWGNAME\nDWGPREFIX"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "变量值"
  }
}
```

## 陷阱

命令末尾加空格表示执行；多余空格/回车可能导致重复执行。

## 相关

rhinocontrol · runAction · step-runner-get
