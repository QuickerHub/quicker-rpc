# sys:windowOperations

> **分类**：窗口 · **来源**：仓库手写 · **官方**：[windowoperations](https://getquicker.net/KC/Help/Doc/windowoperations)

**用途**：移动、缩放、置顶、显示状态、透明度等窗口操作。

## 示例

### 移动窗口

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "move",
    "hWnd.var": "窗口句柄",
    "x": 100,
    "y": 100,
    "width": 800,
    "height": 600
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
    "isSuccess": "成功"
  }
}
```

### 置为前台

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "SET_FOREGROUND",
    "hWnd.var": "窗口句柄"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `hWnd` 留空或 0=前台窗口；`move_ex` 用 `area`（百分比或像素矩形）替代 x/y/width/height。
- 透明度用 `set_trans` + `alpha`（0–255 或 ±增量）；`show` 的 `showCmd` 对应 Win32 SW_*。
- 写步骤前 `get --control-field move` 等。

## 相关

activateProcessMainWindow · restoreActiveWindow · sendMessage · step-runner-get
