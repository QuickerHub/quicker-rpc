# sys:inputScript

> **来源**：step JSON 示例 · **官方**：[inputscript](https://getquicker.net/KC/Help/Doc/inputscript)

**用途**：弹出脚本输入框，将用户输入写入变量。

## 示例

### 单行脚本输入

```json
{
  "stepRunnerKey": "sys:inputScript",
  "inputParams": {
    "data": "请输入命令："
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 多行模板输入

```json
{
  "stepRunnerKey": "sys:inputScript",
  "inputParams": {
    "data": "粘贴 JSON 配置：\n"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
