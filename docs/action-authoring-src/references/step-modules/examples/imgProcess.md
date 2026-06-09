# sys:imgProcess

> **来源**：step JSON 示例 · **官方**：[imgprocess](https://getquicker.net/KC/Help/Doc/imgprocess)

**用途**：缩放、旋转、灰度等常见图片处理。

## 示例

### 按比例缩放

```json
{
  "stepRunnerKey": "sys:imgProcess",
  "inputParams": {
    "type": "resize_percent",
    "img.var": "原图",
    "resizePercent": "50"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "结果图"
  }
}
```

### 限制最大宽高

```json
{
  "stepRunnerKey": "sys:imgProcess",
  "inputParams": {
    "type": "resize_pixel",
    "img.var": "原图",
    "maxWidth": "800",
    "maxHeight": "600"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "结果图"
  }
}
```

### 灰度化

```json
{
  "stepRunnerKey": "sys:imgProcess",
  "inputParams": {
    "type": "GrayScale",
    "img.var": "原图"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "灰度图"
  }
}
```
