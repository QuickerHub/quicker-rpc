# sys:getFolderPath

> **来源**：step JSON 示例 · **官方**：[getfolderpath](https://getquicker.net/KC/Help/Doc/getfolderpath)

**用途**：获取 Windows 特殊文件夹路径。

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
