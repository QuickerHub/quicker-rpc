# sys:selectFolder

> **来源**：step JSON 示例 · **官方**：[selectfolder](https://getquicker.net/KC/Help/Doc/selectfolder)

**用途**：弹出文件夹选择对话框并返回路径。

## 示例

### 选择文件夹

```json
{
  "stepRunnerKey": "sys:selectFolder",
  "inputParams": {
    "prompt": "请选择输出目录",
    "initDir.var": "初始目录"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```

### 显示已打开目录

```json
{
  "stepRunnerKey": "sys:selectFolder",
  "inputParams": {
    "prompt": "选择工作区",
    "showOpenedDirs": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```
