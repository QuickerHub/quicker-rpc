# sys:pathExtraction

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[pathextraction](https://getquicker.net/KC/Help/Doc/pathextraction)

**用途**：从路径提取文件名/目录/扩展名，或改扩展名、换目录、拼接路径。

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

## 陷阱

- `getInfo` 输出 `path` 为**父目录**（与输入 param `path` 同名不同义）；改路径类操作输出 `resultPath`。
- `newExtension` 须带点（如 `.png`）；`combine` 可用 `path`~`path4` 多段拼接。
- 复杂路径逻辑可用 `evalexpression` 的 `Path.Combine`/`GetFileName`。

## 相关

checkPathExists · fileOperation · readFile · evalexpression · step-runner-get
