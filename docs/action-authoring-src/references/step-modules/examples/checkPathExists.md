# sys:checkPathExists

> **来源**：step JSON 示例 · **官方**：[checkpathexists](https://getquicker.net/KC/Help/Doc/checkpathexists)

**用途**：检查路径是否存在并获取文件/文件夹元数据。

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
