# sys:SelectFileInExplorer

> **分类**：文件 · **来源**：仓库手写 · **官方**：[selectfileinexplorer](https://getquicker.net/KC/Help/Doc/selectfileinexplorer)

**用途**：在资源管理器中打开并选中指定文件或文件夹。

## 示例

### 选中文件

```json
{
  "stepRunnerKey": "sys:SelectFileInExplorer",
  "inputParams": {
    "path.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `path` 须为完整路径（文件或文件夹）；失败时 `stopIfFail` 控制是否停动作。
- 与 `selectFile`（对话框选路径）不同，本模块在已打开的 Explorer 中定位。

## 相关

selectFile · selectFolder · pathExtraction · step-runner-get
