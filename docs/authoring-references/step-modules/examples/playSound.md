# sys:playSound

> **来源**：step JSON 示例 · **官方**：[playsound](https://getquicker.net/KC/Help/Doc/playsound)

**用途**：播放本地音效、外部音频或 TTS 朗读。

## 示例

### 播放内置音效

```json
{
  "stepRunnerKey": "sys:playSound",
  "inputParams": {
    "type": "LOCAL",
    "localSound": "Complete"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 播放外部音频

```json
{
  "stepRunnerKey": "sys:playSound",
  "inputParams": {
    "type": "EXTERN",
    "uri.var": "音频路径",
    "wait": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 文本朗读

```json
{
  "stepRunnerKey": "sys:playSound",
  "inputParams": {
    "type": "TTS",
    "text.var": "朗读内容"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
