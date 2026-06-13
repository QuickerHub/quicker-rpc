# sys:whiteboard

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[whiteboard](https://getquicker.net/KC/Help/Doc/whiteboard)

**用途**：弹出白板供用户手写涂鸦，输出 Image 变量。

## 示例

### 打开白板

```json
{
  "stepRunnerKey": "sys:whiteboard",
  "inputParams": {
    "winPosition": "15%,30%,85%,70%",
    "bgColor": "#FFFFFFFF",
    "penColor": "#FFFF0000"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "结果图片"
  }
}
```

### 透明背景截图

```json
{
  "stepRunnerKey": "sys:whiteboard",
  "inputParams": {
    "enableTransparent": true,
    "imageWithBackground": false
  },
  "outputParams": {
    "result": "标注图片"
  }
}
```

## 陷阱

- 颜色格式 `#AARRGGBB`；`winPosition` 为 `left,top,right,bottom` 或百分比。
- 用户取消时 `isSuccess=false`；`liveRun: false`；输出 `result` 为 Image 类型。

## 相关

screenCapture · showImage · imageOperations · step-runner-get
