# sys:getClipboardFiles

> **分类**：剪贴板 · **来源**：仓库手写 · **官方**：[getclipboardfiles](https://getquicker.net/KC/Help/Doc/getclipboardfiles)

**用途**：读取剪贴板中已复制文件/文件夹的完整路径列表。

## 示例

### 读取剪贴板文件

```json
{
  "stepRunnerKey": "sys:getClipboardFiles",
  "outputParams": {
    "isSuccess": "成功",
    "output": "文件列表"
  }
}
```

## 陷阱

- 输出 `output` 为路径**列表**；剪贴板无文件时可能失败（受 `stopIfFail` 控制是否中止动作）。
- 可选绑定 `elapsedMs`（剪贴板距上次更新的毫秒数）；写入剪贴板文件用 `fileToClipboard`，纯文本用 `getClipboardText`。

## 相关

fileToClipboard · getClipboardText · getSelectedFiles · fileOperation · step-runner-get
