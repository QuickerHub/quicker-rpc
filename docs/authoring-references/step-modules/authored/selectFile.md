# sys:selectFile

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[selectfile](https://getquicker.net/KC/Help/Doc/selectfile)

**用途**：系统文件对话框选择打开/保存路径。

## 示例

### 打开单个文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "openFile",
    "filter": "文本文件(*.txt)|*.txt|所有文件|*.*",
    "initDir.var": "初始目录",
    "title": "请选择文件"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```

### 打开多个文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "openMultiFile",
    "filter": "图片文件|*.jpg;*.png;*.bmp|所有文件|*.*",
    "topMost": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表"
  }
}
```

### 保存文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "saveFile",
    "filter": "JSON 文件|*.json|所有文件|*.*",
    "defaultExt": ".json",
    "initFileName.var": "默认文件名",
    "title": "另存为"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```

## 陷阱

- `filter` 格式 `描述|*.ext|描述2|*.ext2`；`openMultiFile` 输出 `pathList` 非 `path`。
- 用户取消时 `isSuccess=false`；`stopIfFail` 控制是否停动作；交互模块勿 headless 实跑。

## 相关

readFile · WriteTextFile · pathExtraction · step-runner-get
