# sys:restoreActiveWindow

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[restoreactivewindow](https://getquicker.net/KC/Help/Doc/restoreactivewindow)

**用途**：将前台焦点恢复到动作开始时的活动窗口。

## 示例

### 恢复启动前窗口

```json
{
  "stepRunnerKey": "sys:restoreActiveWindow"
}
```

## 陷阱

- **无 input/output**；在 `userInput`/`form`/`MsgBox` 等改变前台窗口后，继续向原窗口 `outputText` 前调用。
- 激活指定进程窗口用 `activateProcessMainWindow`；仅记录当前前台信息用 `getActiveProcessInfo`。

## 相关

activateProcessMainWindow · getActiveProcessInfo · userInput · outputText · step-runner-get
