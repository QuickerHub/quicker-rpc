# sys:autocadcontrol

> **来源**：step JSON 示例 · **官方**：[autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol)

**用途**：向 AutoCAD 发送命令或读取文档变量。

## 示例

### 执行 Zoom All

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

### 执行 AutoLISP

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
