# sys:showImage

> **分类**：图像 · **来源**：仓库手写 · **官方**：[showimage](https://getquicker.net/KC/Help/Doc/showimage)

**用途**：浮窗显示图片（文件/变量/剪贴板），或管理图片窗口。

## 示例

### 显示变量中的图片

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "var",
    "imgVar.var": "截图",
    "opacity": 0.9,
    "autoCloseTime": 5
  },
  "outputParams": {
    "hwnd": "窗口句柄",
    "finalPosition": "最终位置"
  }
}
```

### 显示文件

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "file",
    "path.var": "图片路径",
    "scale": 1
  },
  "outputParams": {
    "hwnd": "窗口句柄"
  }
}
```

### 关闭指定窗口

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "closeWindow",
    "autoCloseKey.var": "窗口标识"
  }
}
```

## 陷阱

- `source`: `file`/`var`/`clipboard`/`closeWindow`/`getState`/`getImageWindows`；`autoCloseKey` 标识同键旧窗。
- `opacity` 为 0–1 小数（非百分比）；`waitClose` 阻塞至用户关闭；`scale` 1=原尺寸。
- 写步骤前 `get --control-field var` 等。

## 相关

screenCapture · imageOperations · whiteboard · step-runner-get
