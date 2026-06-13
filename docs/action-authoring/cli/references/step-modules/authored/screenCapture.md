# sys:screenCapture

> **分类**：图像 · **来源**：仓库手写 · **官方**：[screencapture](https://getquicker.net/KC/Help/Doc/screencapture)

**用途**：截取屏幕区域到图片变量或剪贴板。

## 示例

### 手工选择区域

```json
{
  "stepRunnerKey": "sys:screenCapture",
  "inputParams": {
    "type": "select",
    "delay": 300
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "截图",
    "rect": "区域"
  }
}
```

### 固定坐标范围

```json
{
  "stepRunnerKey": "sys:screenCapture",
  "inputParams": {
    "type": "fixed_area",
    "area": "100,100,500,400"
  },
  "outputParams": {
    "img": "截图",
    "rect": "区域"
  }
}
```

### 窗口可见内容

```json
{
  "stepRunnerKey": "sys:screenCapture",
  "inputParams": {
    "type": "window",
    "windowHandle.var": "窗口句柄"
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "截图",
    "rect": "区域"
  }
}
```

## 陷阱

- `type`: `select`/`full_screen`/`primary_screen`/`fixed_area`/`window`/`windowBackground`；`area`/`rect` 为 `left,top,right,bottom`，默认不含右/底边像素（`includeRightBottomBorder` 可改）。
- `windowHandle` 留空=前台窗口；后台窗口用 `windowBackground`；交互选区 `liveRun: false`。
- 写步骤前 `get --control-field select` 等过滤参数。

## 相关

screenCapturePro · imageOperations · readQrCode · WriteImageFile · step-runner-get
