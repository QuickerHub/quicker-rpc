# sys:fileSystemWatch

> **来源**：step JSON 示例 · **官方**：[filesystemwatch](https://getquicker.net/KC/Help/Doc/filesystemwatch)

**用途**：监控文件夹创建/变更/删除/重命名事件。

## 示例

### 等待新文件出现

```json
{
  "stepRunnerKey": "sys:fileSystemWatch",
  "inputParams": {
    "operation": "wait",
    "path.var": "监控目录",
    "filter": "*.csv",
    "waitEvents": "created",
    "waitSeconds": 60
  },
  "outputParams": {
    "isSuccess": "成功",
    "fullPath": "事件路径",
    "changedType": "事件类型"
  }
}
```

### 持续监控并回调子程序

```json
{
  "stepRunnerKey": "sys:fileSystemWatch",
  "inputParams": {
    "operation": "callback",
    "path.var": "监控目录",
    "includeSubdirectories": "1",
    "createdCallback": "处理文件创建",
    "changedCallback": "处理文件变更"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
