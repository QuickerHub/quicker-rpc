# sys:shelloperation

> **分类**：文件 · **来源**：仓库手写 · **官方**：[shelloperation](https://getquicker.net/KC/Help/Doc/shelloperation)

**用途**：对文件/文件夹执行 Explorer Shell 动词或上下文菜单。

## 示例

### 获取可用动词

```json
{
  "stepRunnerKey": "sys:shelloperation",
  "inputParams": {
    "operation": "getverb",
    "pathOrExt": ".txt"
  },
  "outputParams": {
    "isSuccess": "成功",
    "verbs": "动词列表"
  }
}
```

### 对文件执行动词

```json
{
  "stepRunnerKey": "sys:shelloperation",
  "inputParams": {
    "operation": "execverb",
    "pathList.var": "文件路径列表",
    "verb": "print"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 按标题执行菜单

```json
{
  "stepRunnerKey": "sys:shelloperation",
  "inputParams": {
    "operation": "execbytitle",
    "pathList.var": "文件路径列表",
    "title": "添加到压缩包"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `operation`: `getverb`/`execverb`/`gettitles`/`execbytitle`/`showmenu`；`verbs` 项格式 `描述|动词`。
- `execverb` 的 `verb` 依赖本机 Shell 扩展；`execbytitle` 须精确匹配菜单标题。
- 写步骤前 `get --control-field getverb` 等过滤参数。

## 相关

run · SelectFileInExplorer · step-runner-get
