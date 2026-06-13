# sys:WriteImageFile

> **分类**：文件 · **来源**：仓库手写 · **官方**：[writeimagefile](https://getquicker.net/KC/Help/Doc/writeimagefile)

**用途**：将 Image 变量写入磁盘文件。

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

## 陷阱

- `content` 须为 **Image 变量**；扩展名决定格式；`quality` 仅 JPG（10–100，默认 95）。
- 与 `WriteTextFile` 区分；读取用 `readFile`（二进制）或 `imageOperations`。

## 相关

screenCapture · tempImgBed · imageOperations · step-runner-get
