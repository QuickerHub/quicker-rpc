# sys:pathExtraction

> **来源**：step JSON 示例 · **官方**：[pathextraction](https://getquicker.net/KC/Help/Doc/pathextraction)

**用途**：解析或组合文件路径各部分。

## 示例

### 解析路径信息

```json
{
  "stepRunnerKey": "sys:pathExtraction",
  "inputParams": {
    "operation": "getInfo",
    "path.var": "完整路径"
  },
  "outputParams": {
    "isSuccess": "成功",
    "name": "文件名",
    "nameNoExt": "主名",
    "ext": "扩展名",
    "path": "目录"
  }
}
```

### 更换扩展名

```json
{
  "stepRunnerKey": "sys:pathExtraction",
  "inputParams": {
    "operation": "changeExt",
    "path.var": "源路径",
    "newExtension": ".txt"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultPath": "新路径"
  }
}
```

### 组合路径

```json
{
  "stepRunnerKey": "sys:pathExtraction",
  "inputParams": {
    "operation": "combine",
    "path.var": "目录",
    "path2": "readme.md"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultPath": "完整路径"
  }
}
```
