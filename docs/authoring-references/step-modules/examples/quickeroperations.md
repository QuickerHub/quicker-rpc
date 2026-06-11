# sys:quickeroperations

> **来源**：step JSON 示例 · **官方**：[quickeroperations](https://getquicker.net/KC/Help/Doc/quickeroperations)

**用途**：在动作中调用 Quicker 内置功能（面板、搜索、轮盘等）。

## 示例

### 显示 Quicker 面板

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "showPanel",
    "activatePointWindow": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 打开搜索框并填入关键词

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "showSearch",
    "searchText": "fa:chrome"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 暂停/恢复 Quicker

```json
{
  "stepRunnerKey": "sys:quickeroperations",
  "inputParams": {
    "type": "togglePause"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
