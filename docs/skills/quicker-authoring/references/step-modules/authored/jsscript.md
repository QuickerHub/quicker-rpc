# sys:jsscript

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[jsscript](https://getquicker.net/KC/Help/Doc/jsscript)

**用途**：执行 JavaScript 片段（须定义 `exec()` 主函数）。

## 示例

### 读写动作变量

```json
{
  "stepRunnerKey": "sys:jsscript",
  "inputParams": {
    "script": "function exec(){\n  var n = quickerGetVar('name');\n  quickerSetVar('greeting', 'Hello, ' + n);\n  return 0;\n}"
  },
  "outputParams": {
    "isSuccess": "成功",
    "return": "返回值"
  }
}
```

### 访问 .NET 程序集

```json
{
  "stepRunnerKey": "sys:jsscript",
  "inputParams": {
    "script": "function exec(){\n  var dt = System.DateTime.Now;\n  quickerSetVar('now', dt.ToString());\n  return 0;\n}",
    "allClr": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 相关

csscript · pythonscript · step-runner-get
