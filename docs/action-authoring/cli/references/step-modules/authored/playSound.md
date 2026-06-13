# sys:playSound

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[playsound](https://getquicker.net/KC/Help/Doc/playsound)

**用途**：播放 Quicker 内置提示音、外部音频文件/URL 或系统 TTS 朗读。

## 示例

### 播放内置音效

```json
{
  "stepRunnerKey": "sys:playSound",
  "inputParams": {
    "type": "LOCAL",
    "localSound": "succeed"
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
    "wait": true
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

## 陷阱

- `type` 分支：`LOCAL`+`localSound`（`info`/`snip`/`succeed`/`warning`/`wrong`）/ `EXTERN`+`uri` / `TTS`+`text`。
- `wait: true` 阻塞至播放结束；异步提示可 `wait: false`。
- 录音/语音识别用 `recordSound`；仅 UI 通知用 `notify`。

## 相关

recordSound · notify · run · download · step-runner-get
