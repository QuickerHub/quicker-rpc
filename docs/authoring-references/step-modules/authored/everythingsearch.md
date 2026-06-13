# sys:everythingsearch

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[everythingsearch](https://getquicker.net/KC/Help/Doc/everythingsearch)

**用途**：调用本机 Everything 1.4.1+ 搜索文件，返回路径列表。

## 示例

### 关键词搜索

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "readme",
    "maxCount": 50
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表",
    "resultCount": "数量"
  }
}
```

### 限定目录与扩展名

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "report",
    "folder": "D:\\Work\\",
    "ext": "pdf;docx"
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表"
  }
}
```

### 完整文件名匹配

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "config.json",
    "matchWholeFilename": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表"
  }
}
```

## 陷阱

- 需 Everything **已安装并在运行**；SDK 调用不支持 `exe:`/`doc:` 等宏，类型筛选用 `ext` 参数或搜索串内 `ext:pdf;docx`。
- `folder` 目录末尾加 `\`，否则匹配以该字符串开头的所有路径；多目录可在 `search` 内写 `"C:\\A\\"|"D:\\B\\" 关键词`。
- `maxCount: -1` 不限数量；`matchWholeFilename` 等价于搜索前加 `wfn:` 前缀。

## 相关

fileOperation · selectFile · checkPathExists · step-runner-get
