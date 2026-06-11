# sys:csscript

> **来源**：step JSON 示例 · **官方**：[csscript](https://getquicker.net/KC/Help/Doc/csscript)

**用途**：执行 C# 脚本（`Exec`）；简单逻辑优先 `sys:evalexpression`。

## 示例

### 普通模式 v2 内联

```json
{
  "stepRunnerKey": "sys:csscript",
  "inputParams": {
    "mode": "normal_roslyn",
    "script": "public static void Exec(Quicker.Public.IStepContext ctx) { ctx.SetVarValue(\"msg\", \"ok\"); }"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 外链 .cs 文件

```json
{
  "stepRunnerKey": "sys:csscript",
  "inputParams": {
    "mode": "normal_roslyn",
    "script.file": "files/handler.cs"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rtn": "返回值"
  }
}
```

### 低权限模式传参

```json
{
  "stepRunnerKey": "sys:csscript",
  "inputParams": {
    "mode": "low_permission_roslyn",
    "scriptForLp": "public static string Exec(string paramValue) { return paramValue.ToUpper(); }",
    "paramValue.var": "输入",
    "waitResp": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "resp": "响应"
  }
}
```
