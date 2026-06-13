# sys:checkPathExists

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[checkpathexists](https://getquicker.net/KC/Help/Doc/checkpathexists)

**用途**：检查路径是否存在，并可选输出文件/文件夹元数据、哈希与扩展属性。

## 示例

### 检查文件是否存在

```json
{
  "stepRunnerKey": "sys:checkPathExists",
  "inputParams": {
    "path.var": "文件路径"
  },
  "outputParams": {
    "isExists": "存在",
    "isFile": "是文件",
    "fileLength": "大小",
    "editTime": "修改时间"
  }
}
```

### 检查文件夹并统计

```json
{
  "stepRunnerKey": "sys:checkPathExists",
  "inputParams": {
    "path": "D:\\Projects\\demo"
  },
  "outputParams": {
    "isExists": "存在",
    "isFolder": "是文件夹",
    "fileCount": "文件数",
    "totalLength": "总大小"
  }
}
```

### 获取文件哈希

```json
{
  "stepRunnerKey": "sys:checkPathExists",
  "inputParams": {
    "path.var": "待校验文件"
  },
  "outputParams": {
    "isExists": "存在",
    "md5hash": "MD5",
    "sha256hash": "SHA256"
  }
}
```

## 陷阱

- `fileCount` / `totalLength` 会递归扫描文件夹，大目录耗时长；不需要统计时不要绑定这两项。
- `md5hash` 等哈希输出仅对**文件**有效，大文件扫描较慢；文件哈希也可配合 `sys:enc` 的流式模式。
- `metaData` 为词典，每项含 `属性名` 与 `属性名_FriendlyName`；`.lnk` 目标可用 `lnkTarget` 或 `metaData` 的 `Link.TargetParsingPath`。

## 相关

fileOperation · readFile · enc · pathExtraction · step-runner-get
