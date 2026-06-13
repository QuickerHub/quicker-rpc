# sys:checkProcessExists

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[checkprocessexists](https://getquicker.net/KC/Help/Doc/checkprocessexists)

**用途**：检查进程是否运行并获取 PID、路径、主窗口等元数据。

## 示例

### 检查记事本是否运行

```json
{
  "stepRunnerKey": "sys:checkProcessExists",
  "inputParams": {
    "process": "notepad"
  },
  "outputParams": {
    "isSuccess": "操作成功",
    "isExists": "在运行",
    "pid": "PID",
    "path": "程序路径"
  }
}
```

### 按 PID 查询

```json
{
  "stepRunnerKey": "sys:checkProcessExists",
  "inputParams": {
    "process": "12345"
  },
  "outputParams": {
    "isSuccess": "操作成功",
    "isExists": "在运行",
    "mainwinTitle": "窗口标题"
  }
}
```

### 多实例进程列表

```json
{
  "stepRunnerKey": "sys:checkProcessExists",
  "inputParams": {
    "process": "chrome"
  },
  "outputParams": {
    "isExists": "在运行",
    "pidList": "全部PID",
    "startTime": "启动时间"
  }
}
```

## 陷阱

- `isSuccess` 表示**查询操作**是否成功（权限等）；`isExists` 才表示进程是否在运行——未启动时 `isExists=false` 但 `isSuccess` 仍可为 true。
- `process` 为 exe 名去后缀（如 `winword`）或数字 PID；多实例时用 `pidList`，`pid` 仅为第一个匹配。
- 高权限进程可能查不到详情；激活窗口用 `sys:activateProcessMainWindow`。

## 相关

activateProcessMainWindow · getActiveProcessInfo · run · step-runner-get
