# sys:showWaitWin

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[showwaitwin](https://getquicker.net/KC/Help/Doc/showwaitwin)

**用途**：显示/更新等待提示窗（含进度条），供用户手动确认完成。

## 示例

### 显示等待窗

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "show",
    "title": "处理中",
    "prompt": "请稍候…",
    "progress": "30/100"
  }
}
```

### 更新进度

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "update",
    "prompt": "$$已完成 {进度}%",
    "progress.var": "进度"
  }
}
```

### 显示并等待关闭

```json
{
  "stepRunnerKey": "sys:showWaitWin",
  "inputParams": {
    "mode": "showAndWaitClose",
    "title": "请完成操作",
    "btnText": "完成",
    "operations": "跳过|skip"
  },
  "outputParams": {
    "selectedOperation": "选择的按钮"
  }
}
```

## 陷阱

- `mode`: `show`/`update`/`check`/`close`/`waitClose`/`showAndWaitClose`；`progress` 格式 `当前/总数`。
- `operations` 每行 `显示|值`；`stopActionIfClose` 点 X 是否停动作；全局单例窗，勿并发多实例。
- 写步骤前 `get --control-field show` 等。

## 相关

reportProgress · notify · showText · step-runner-get
