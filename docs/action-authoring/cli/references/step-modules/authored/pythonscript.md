# sys:pythonscript

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[pythonscript](https://getquicker.net/KC/Help/Doc/pythonscript)

**用途**：执行 Python 代码片段（使用 Quicker 内置 `quicker` 上下文）。

## 示例

### 设置变量

```json
{
  "stepRunnerKey": "sys:pythonscript",
  "inputParams": {
    "script": "quicker.context.SetVarValue('text', 'hello from python')"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 指定 Python 环境路径

```json
{
  "stepRunnerKey": "sys:pythonscript",
  "inputParams": {
    "script": "import json\nquicker.context.SetVarValue('data', json.dumps({'ok': True}))",
    "pythonPath": "C:\\Python311"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 相关

jsscript · csscript · step-runner-get
