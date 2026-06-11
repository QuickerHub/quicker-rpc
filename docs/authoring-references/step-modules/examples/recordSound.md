# sys:recordSound

> **来源**：step JSON 示例 · **官方**：[recordsound](https://getquicker.net/KC/Help/Doc/recordsound)

**用途**：录制麦克风音频或短语音输入。

## 示例

### 录制到文件

```json
{
  "stepRunnerKey": "sys:recordSound",
  "inputParams": {
    "operation": "record",
    "filePath.var": "输出路径",
    "silentStopSeconds": "2"
  },
  "outputParams": {
    "isSuccess": "成功",
    "outputFilePath": "文件路径"
  }
}
```

### 短语音输入

```json
{
  "stepRunnerKey": "sys:recordSound",
  "inputParams": {
    "operation": "short_voice_input",
    "helpText": "请说话…"
  },
  "outputParams": {
    "isSuccess": "成功",
    "speechContent": "识别文本"
  }
}
```
