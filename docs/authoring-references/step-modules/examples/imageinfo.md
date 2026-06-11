# sys:imageinfo

> **来源**：step JSON 示例 · **官方**：[imageinfo](https://getquicker.net/KC/Help/Doc/imageinfo)

**用途**：读取图片尺寸、方向与 EXIF 信息。

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
    "autoRotate": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "dateTimeOriginal": "拍摄时间",
    "exifData": "EXIF词典"
  }
}
```
