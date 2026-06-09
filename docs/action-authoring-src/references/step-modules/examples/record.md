# sys:record

> **来源**：step JSON 示例 · **官方**：[record](https://getquicker.net/KC/Help/Doc/record)

**用途**：开始键鼠录制，输出录制数据文本。

## 示例

### 基础录制

```json
{
  "stepRunnerKey": "sys:record",
  "outputParams": {
    "isSuccess": "成功",
    "output": "录制数据"
  }
}
```

### 含准备倒计时

```json
{
  "stepRunnerKey": "sys:record",
  "inputParams": {
    "prepareSeconds": "3",
    "recordMouseMove": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "录制数据"
  }
}
```
