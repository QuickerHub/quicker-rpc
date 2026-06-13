# sys:selectFolder

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[selectfolder](https://getquicker.net/KC/Help/Doc/selectfolder)

**用途**：文件夹选择对话框，返回目录路径。

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
    "showOpenedDirs": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```

## 陷阱

- 用户取消时 `isSuccess=false`；`showOpenedDirs` 列出当前 Explorer 已开文件夹供快选。
- 交互模块 `liveRun: false`；选文件用 `selectFile`。

## 相关

selectFile · readFile · WriteTextFile · step-runner-get
