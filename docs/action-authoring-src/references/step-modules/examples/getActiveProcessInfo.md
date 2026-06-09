# sys:getActiveProcessInfo

> **来源**：step JSON 示例 · **官方**：[getactiveprocessinfo](https://getquicker.net/KC/Help/Doc/getactiveprocessinfo)

**用途**：获取前台窗口对应进程的路径、名称与 PID。

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
