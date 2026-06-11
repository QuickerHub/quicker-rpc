# sys:screenCapture

> **来源**：step JSON 示例 · **官方**：[screencapture](https://getquicker.net/KC/Help/Doc/screencapture)

**用途**：截取屏幕区域到图片变量或剪贴板。

## 示例

### 手工选择区域

```json
{
  "stepRunnerKey": "sys:screenCapture",
  "inputParams": {
    "type": "select",
    "delay": "300"
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

### 主屏幕并写入剪贴板

```json
{
  "stepRunnerKey": "sys:screenCapture",
  "inputParams": {
    "type": "primary_screen",
    "delay": "500",
    "toClip": "1"
  },
  "outputParams": {
    "img": "截图"
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
