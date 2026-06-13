# sys:fileSystemWatch

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[filesystemwatch](https://getquicker.net/KC/Help/Doc/filesystemwatch)

**用途**：监控文件夹内文件/子目录的创建、变更、删除、重命名。

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
    "includeSubdirectories": true,
    "createdCallback": "处理文件创建",
    "changedCallback": "处理文件变更"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `wait` 模式阻塞至 `waitEvents` 命中或 `waitSeconds` 超时（`0` 不限时）；`callback` 模式填**子程序 callIdentifier**（非动作 ID）。
- `waitEvents` 可多事件组合（如 `created,changed`）；重命名时绑定 `fullPath`（新路径）与 `oldFullPath`。
- `filter` 默认 `*.*`；`notifyFilter` 留空等价 `LastWrite,FileName,DirectoryName`。

## 相关

subprogram · fileOperation · waitClipboardChange · step-runner-get
