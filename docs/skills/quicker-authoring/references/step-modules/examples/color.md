# sys:color

> **来源**：step JSON 示例 · **官方**：[color](https://getquicker.net/KC/Help/Doc/color)

**用途**：屏幕取色、颜色格式转换与通道分解。

## 示例

### 解析 HEX 颜色

```json
{
  "stepRunnerKey": "sys:color",
  "inputParams": {
    "type": "fromString",
    "colorStr": "#6496C8",
    "format": "rgba"
  },
  "outputParams": {
    "isSuccess": "成功",
    "R": "红",
    "G": "绿",
    "B": "蓝",
    "textValue": "rgba文本"
  }
}
```

### 取屏幕坐标颜色

```json
{
  "stepRunnerKey": "sys:color",
  "inputParams": {
    "type": "fromScreenPosition",
    "location": "100,200",
    "format": "HEX_RGB"
  },
  "outputParams": {
    "isSuccess": "成功",
    "textValue": "十六进制"
  }
}
```

### 吸管选色

```json
{
  "stepRunnerKey": "sys:color",
  "inputParams": {
    "type": "selectFromScreen",
    "format": "HEX_ARGB"
  },
  "outputParams": {
    "isSuccess": "成功",
    "textValue": "ARGB文本"
  }
}
```
