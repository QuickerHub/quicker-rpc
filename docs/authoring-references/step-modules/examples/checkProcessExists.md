# sys:checkProcessExists

> **来源**：step JSON 示例 · **官方**：[checkprocessexists](https://getquicker.net/KC/Help/Doc/checkprocessexists)

**用途**：检查进程是否运行并获取进程信息。

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
