# sys:createQrCode

> **来源**：step JSON 示例 · **官方**：[createqrcode](https://getquicker.net/KC/Help/Doc/createqrcode)

**用途**：将文本生成二维码图片。

## 示例

### 基础文本二维码

```json
{
  "stepRunnerKey": "sys:createQrCode",
  "inputParams": {
    "code": "https://example.com/page"
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "二维码"
  }
}
```

### 自定义颜色与尺寸

```json
{
  "stepRunnerKey": "sys:createQrCode",
  "inputParams": {
    "code.var": "链接",
    "pixelsPerModule": 8,
    "darkColor": "#FF1a1a1a",
    "lightColor": "#FFFFFFFF"
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "二维码"
  }
}
```

### 带中心图标

```json
{
  "stepRunnerKey": "sys:createQrCode",
  "inputParams": {
    "code": "WIFI:T:WPA;S:MyNetwork;P:secret;;",
    "icon.var": "Logo",
    "iconPercent": 20
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "二维码",
    "svg": "SVG"
  }
}
```
