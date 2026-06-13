# sys:run

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[run](https://getquicker.net/KC/Help/Doc/run)

**用途**：运行 exe/命令，或打开文件、文件夹、URL（等同 Win+R）。

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
    "waitExit": true,
    "outputEncoding": "utf-8"
  },
  "outputParams": {
    "isSuccess": "成功",
    "stdout": "标准输出",
    "exitCode": "退出码"
  }
}
```

## 陷阱

- 绑定 `stdout`/`stderr`/`exitCode` 会**自动 waitExit**；仅控制台程序，乱码时改 `outputEncoding`（`oem`/`utf8`）。
- `runas: true` 提权；`activateWindowIfRunning` + `activateWindowHotkey` 用于已运行实例；打开网页简单场景可用 `openUrl`。
- `setWorkingDir`: `1`=exe 所在目录；`envVariables` 多行 `名=值`。

## 相关

openUrl · checkProcessExists · activateProcessMainWindow · runScript · step-runner-get
