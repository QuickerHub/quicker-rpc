# sys:windowOperations

> **来源**：step JSON 示例 · **官方**：[windowoperations](https://getquicker.net/KC/Help/Doc/windowoperations)

**用途**：移动、缩放、置顶或调整窗口透明度。

## 示例

### 移动窗口

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "move",
    "hWnd.var": "窗口句柄",
    "x": "100",
    "y": "100"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 设置置顶

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "setTopmost",
    "hWnd.var": "窗口句柄"
  },
  "outputParams": {
    "isTopmost": "是否置顶"
  }
}
```

### 调整大小与透明度

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "move_ex",
    "hWnd.var": "窗口句柄",
    "area": "100,100,800,600",
    "alpha": "230"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 切换置顶

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "toggleTopMost",
    "hWnd.var": "窗口句柄"
  },
  "outputParams": {
    "isTopmost": "是否置顶"
  }
}
```
