# sys:runScript

> **来源**：step JSON 示例 · **官方**：[runscript](https://getquicker.net/KC/Help/Doc/runscript)

**用途**：执行 CMD、批处理或自定义扩展脚本并可选捕获输出。

## 示例

### CMD 单行命令

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "type": "CMD_C",
    "script": "echo hello",
    "waitToExit": "1"
  },
  "outputParams": {
    "stdout": "标准输出",
    "stderr": "错误输出"
  }
}
```

### 批处理多行（管理员）

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "type": "BAT",
    "script": "@echo off\nnetsh interface set interface \"Wi-Fi\" disable\necho done",
    "runAsAdmin": "1",
    "waitToExit": "1"
  },
  "outputParams": {
    "stdout": "标准输出"
  }
}
```

### 写入 PATH（插值变量）

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "type": "CMD_H",
    "script": "$$setx Path \"%Path%;{工具目录}\" /m",
    "runAsAdmin": "1",
    "waitToExit": "1"
  },
  "outputParams": {
    "stdout": "标准输出"
  }
}
```

### 指定工作目录与编码

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "type": "CMD_C",
    "script": "dir /b",
    "workingDir.var": "工作目录",
    "encoding": "utf-8",
    "outputEncoding": "utf-8",
    "waitToExit": "1"
  },
  "outputParams": {
    "stdoutOnly": "纯文本输出"
  }
}
```
