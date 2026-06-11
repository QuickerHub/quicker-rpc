# sys:shelloperation

> **来源**：step JSON 示例 · **官方**：[shelloperation](https://getquicker.net/KC/Help/Doc/shelloperation)

**用途**：对文件或文件夹触发资源管理器 Shell 动词或菜单。

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

### 获取菜单标题列表

```json
{
  "stepRunnerKey": "sys:shelloperation",
  "inputParams": {
    "operation": "gettitles",
    "pathOrExt.var": "目标路径"
  },
  "outputParams": {
    "titles": "标题列表"
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
