# sys:createQrCode

> **分类**：图片 · **来源**：仓库手写 · **官方**：[createqrcode](https://getquicker.net/KC/Help/Doc/createqrcode)

**用途**：将文本生成二维码图片（可选中心图标、SVG/ASCII 输出或导出 PDF）。

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

## 陷阱

- `darkColor` / `lightColor` 为 `#AARRGGBB` 格式；`iconPercent` 只填数字（如 `20` 表示 20%），勿带 `%`。
- `icon` 支持图片变量（`icon.var`）或**本地**图片路径，不支持 URL；内容过长时增大 `pixelsPerModule` 或缩短 `code`。
- 除 `img` 外可绑定 `svg` / `ascii`；需要 PDF 文件时填 `saveToPdfPath` 路径。

## 相关

readQrCode · showImage · WriteImageFile · imgToBase64 · step-runner-get
