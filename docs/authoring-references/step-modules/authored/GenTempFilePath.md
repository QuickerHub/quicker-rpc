# sys:GenTempFilePath

> **分类**：文件 · **来源**：仓库手写 · **官方**：[gentempfilepath](https://getquicker.net/KC/Help/Doc/gentempfilepath)

**用途**：按扩展名生成随机临时文件完整路径（不创建文件）。

## 示例

### 临时文本文件

```json
{
  "stepRunnerKey": "sys:GenTempFilePath",
  "inputParams": {
    "ext": ".txt"
  },
  "outputParams": {
    "filePath": "临时路径"
  }
}
```

### 临时 JSON 文件

```json
{
  "stepRunnerKey": "sys:GenTempFilePath",
  "inputParams": {
    "ext": "json"
  },
  "outputParams": {
    "filePath": "临时路径"
  }
}
```

## 陷阱

- `ext` 可带或不带点；仅返回路径，写入需 `WriteTextFile`/`WriteImageFile`。
- 输出键 `filePath`。

## 相关

WriteTextFile · WriteImageFile · readFile · newGuid · step-runner-get
