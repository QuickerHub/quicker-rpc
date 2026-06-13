# sys:imageinfo

> **分类**：图片 · **来源**：仓库手写 · **官方**：[imageinfo](https://getquicker.net/KC/Help/Doc/imageinfo)

**用途**：读取图片变量或文件的尺寸、旋转与 EXIF 元数据。

## 示例

### 从图片变量读取

```json
{
  "stepRunnerKey": "sys:imageinfo",
  "inputParams": {
    "sourceType": "var",
    "bmpVar.var": "图片"
  },
  "outputParams": {
    "isSuccess": "成功",
    "width": "宽度",
    "height": "高度"
  }
}
```

### 从文件读取 EXIF

```json
{
  "stepRunnerKey": "sys:imageinfo",
  "inputParams": {
    "sourceType": "file",
    "bmpFile.var": "文件路径",
    "autoRotate": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "dateTimeOriginal": "拍摄时间",
    "exifData": "EXIF词典"
  }
}
```

## 陷阱

- `sourceType: var` 用 `bmpVar.var`；`file` 用 `bmpFile` / `bmpFile.var`；二者互斥。
- `autoRotate: true` 时 `width`/`height` 为按 EXIF 旋转后的显示尺寸；`exifData`/`rawExifData` 为词典。
- 文件模式额外输出 `fileTypeFromData`（按内容嗅探格式，可能不准）。

## 相关

readFile · imgProcess · screenCapture · WriteImageFile · step-runner-get
