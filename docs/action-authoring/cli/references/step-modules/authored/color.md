# sys:color

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[color](https://getquicker.net/KC/Help/Doc/color)

**用途**：解析/转换颜色文本、屏幕取色，输出 ARGB 通道与多种文本格式。

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

## 陷阱

- `colorStr` 支持 `#RRGGBB`、`#AARRGGBB`、命名色、`rgb()`/`rgba()`、`CMYK(...)` 等；`fromScreenPosition` 的 `location` 为 `"横坐标,纵坐标"` 字符串。
- `format` 控制 `textValue` 输出形态（如 `HEX_RGB`、`rgba`、`HSL`）；通道输出 `R/G/B/A` 与 HSL/HSV 分量可同时绑定。
- `selectFromScreen` / `editOrSelectColor` 需用户交互；自动化取色优先 `fromScreenPosition` + `searchBmp` 坐标。

## 相关

searchBmp · imgProcess · evalexpression · step-runner-get
