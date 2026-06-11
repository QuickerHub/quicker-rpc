# sys:whiteboard

> **来源**：step JSON 示例 · **官方**：[whiteboard](https://getquicker.net/KC/Help/Doc/whiteboard)

**用途**：弹出白板供用户涂鸦批注。

## 示例

### 打开白板

```json
{
  "stepRunnerKey": "sys:whiteboard",
  "inputParams": {
    "winPosition": "center",
    "bgColor": "#FFFFFF",
    "penColor": "#FF0000"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "结果"
  }
}
```

### 透明背景截图

```json
{
  "stepRunnerKey": "sys:whiteboard",
  "inputParams": {
    "enableTransparent": "1",
    "imageWithBackground": "0"
  },
  "outputParams": {
    "result.var": "标注图片"
  }
}
```
