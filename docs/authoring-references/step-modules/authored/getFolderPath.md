# sys:getFolderPath

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[getfolderpath](https://getquicker.net/KC/Help/Doc/getfolderpath)

**用途**：获取 Windows 特殊文件夹完整路径（`Environment.SpecialFolder` 枚举）。

## 示例

### 桌面目录

```json
{
  "stepRunnerKey": "sys:getFolderPath",
  "inputParams": {
    "folder": "Desktop"
  },
  "outputParams": {
    "path": "桌面路径"
  }
}
```

### 我的文档

```json
{
  "stepRunnerKey": "sys:getFolderPath",
  "inputParams": {
    "folder": "MyDocuments"
  },
  "outputParams": {
    "path": "文档路径"
  }
}
```

## 陷阱

- `folder` 为 wire 枚举键（如 `Desktop`、`Downloads`、`LocalApplicationData`），不是中文显示名；完整列表见 `step-runner get` 的 `options`。
- 输出仅 `path` 文本；临时随机路径用 `GenTempFilePath`，用户自选目录用 `selectFolder`。

## 相关

getExplorerPath · GenTempFilePath · selectFolder · fileOperation · step-runner-get
