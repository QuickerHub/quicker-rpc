# sys:subprogram

> **来源**：step JSON 示例 · **官方**：[subprogram](https://getquicker.net/KC/Help/Doc/subprogram)

**用途**：调用动作内嵌或公共子程序。

## 示例

### 调用公共子程序

```json
{
  "stepRunnerKey": "sys:subprogram",
  "inputParams": {
    "subProgram": "格式化日期",
    "输入文本.var": "原始值"
  },
  "outputParams": {
    "isSuccess": "成功",
    "输出文本": "结果"
  }
}
```

### 按 ID 调用

```json
{
  "stepRunnerKey": "sys:subprogram",
  "inputParams": {
    "subProgram": "e4af1d5b-143b-4b62-4de5-08d85ac8eddb",
    "skipDebugOutput": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 动作内嵌子程序

```json
{
  "stepRunnerKey": "sys:subprogram",
  "inputParams": {
    "subProgram": "清理临时文件",
    "目标目录.var": "工作目录"
  },
  "outputParams": {
    "isSuccess": "成功",
    "删除数量": "数量"
  }
}
```
