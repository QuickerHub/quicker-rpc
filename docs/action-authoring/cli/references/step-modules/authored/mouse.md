# sys:mouse

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[mouse](https://getquicker.net/KC/Help/Doc/mouse)

**用途**：模拟鼠标移动、点击、滚轮与屏幕/窗口找图定位。

## 示例

### 左键单击

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "click",
    "btn": "left"
  }
}
```

### 移动到屏幕坐标

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "moveToXy",
    "xy": "100,200"
  },
  "outputParams": {
    "mouseX": "X",
    "mouseY": "Y"
  }
}
```

### 找图并点击

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "locateByBitmapVar",
    "bmpVar.var": "模板图",
    "extAction": "left",
    "restoreMousePos": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- 写步骤前 `get --control-field <type>`；`moveToXy`/`moveToWinXy` 用 **`xy`/`xyForWin`** 字符串（支持 `50%,50%`），不是单独的 `x`+`y`（`moveTo` 模式才分开）。
- `locateByBitmap*` 与 `searchBmp` 类似但本模块直接移动/点击；`restoreMousePos` 配合 `type: restore` 还原位置。
- `down`/`up` 需配对；窗口相对移动需 `hWnd`（0=前台窗口）。

## 相关

searchBmp · playRecords · getWindowTitle · color · step-runner-get
