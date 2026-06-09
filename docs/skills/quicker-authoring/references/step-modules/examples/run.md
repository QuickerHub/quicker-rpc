# sys:run

> **来源**：step JSON 示例 · **官方**：[run](https://getquicker.net/KC/Help/Doc/run)

**用途**：启动外部程序或脚本。

## 示例

### 启动程序

```json
{
  "stepRunnerKey": "sys:run",
  "inputParams": {
    "path": "notepad.exe",
    "arg.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功",
    "pid": "进程ID"
  }
}
```

### 等待退出并捕获输出

```json
{
  "stepRunnerKey": "sys:run",
  "inputParams": {
    "path.var": "可执行文件",
    "arg": "--json",
    "waitExit": "1",
    "outputEncoding": "utf-8"
  },
  "outputParams": {
    "isSuccess": "成功",
    "stdout": "标准输出",
    "exitCode": "退出码"
  }
}
```
