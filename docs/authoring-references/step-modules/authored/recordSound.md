# sys:recordSound

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[recordsound](https://getquicker.net/KC/Help/Doc/recordsound)

**用途**：录制麦克风/系统声音到文件，或短语音输入识别为文本。

## 示例

### 录制到文件

```json
{
  "stepRunnerKey": "sys:recordSound",
  "inputParams": {
    "operation": "record",
    "filePath.var": "输出路径",
    "silentStopSeconds": 2
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

## 陷阱

- **交互式**；`record` 外录 / `record_internal` 录系统播放声 / `short_voice_input` 语音识别（输出 `speechContent`）。
- `filePath` 可留空（TEMP 自动命名）、完整路径或仅目录；`silentStopSeconds` 静音自动停止。
- 播放音频用 `playSound`；voice-plugin 长语音识别见 voice-asr 相关动作。

## 相关

playSound · audioControl · userInput · fileOperation · step-runner-get
