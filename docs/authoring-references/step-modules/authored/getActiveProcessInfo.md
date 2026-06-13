# sys:getActiveProcessInfo

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getactiveprocessinfo](https://getquicker.net/KC/Help/Doc/getactiveprocessinfo)

**用途**：获取当前前台窗口所属进程的 exe 路径、进程名与 PID。

## 示例

### 获取前台进程信息

```json
{
  "stepRunnerKey": "sys:getActiveProcessInfo",
  "outputParams": {
    "isSuccess": "成功",
    "path": "进程路径",
    "procName": "进程名",
    "pid": "进程ID"
  }
}
```

## 陷阱

- 无业务输入参数（仅默认 `stopIfFail`）；`procName` 通常为 exe 名去后缀（如 `notepad`）。
- 高权限/受保护进程可能 `isSuccess: false`；激活窗口用 `activateProcessMainWindow`，枚举进程用 `checkProcessExists`。

## 相关

activateProcessMainWindow · checkProcessExists · getWindowTitle · restoreActiveWindow · step-runner-get
