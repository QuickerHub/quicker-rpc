# sys:WriteImageFile

> **来源**：step JSON 示例 · **官方**：[writeimagefile](https://getquicker.net/KC/Help/Doc/writeimagefile)

**用途**：将图片变量写入磁盘文件。

## 示例

### 保存 PNG

```json
{
  "stepRunnerKey": "sys:WriteImageFile",
  "inputParams": {
    "content.var": "截图",
    "filePath.var": "输出路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 指定 JPEG 质量

```json
{
  "stepRunnerKey": "sys:WriteImageFile",
  "inputParams": {
    "content.var": "截图",
    "filePath": "C:\\Temp\\out.jpg",
    "quality": "85"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
