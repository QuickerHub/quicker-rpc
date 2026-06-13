# sys:getClipboardImage

> **分类**：剪贴板 · **来源**：仓库手写 · **官方**：[getclipboardimage](https://getquicker.net/KC/Help/Doc/getclipboardimage)

**用途**：读取剪贴板中的图片到图片变量。

## 示例

### 读取剪贴板图片

```json
{
  "stepRunnerKey": "sys:getClipboardImage",
  "outputParams": {
    "isSuccess": "成功",
    "output": "图片"
  }
}
```

## 陷阱

- `output` 为**图片变量**类型；剪贴板无图片时可能失败（`stopIfFail` 控制是否中止）。
- 与 `waitClipboardChange` 配合时，可先等待变更再读本步；保存文件用 `WriteImageFile`，OCR 用 `basic-ocr`。

## 相关

writeClipboard · waitClipboardChange · WriteImageFile · basic-ocr · step-runner-get
