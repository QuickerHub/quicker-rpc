# sys:showText

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[showtext](https://getquicker.net/KC/Help/Doc/showtext)

**用途**：独立文本窗口显示/编辑长文本，或管理已有文本窗。

## 示例

### 不等待显示

```json
{
  "stepRunnerKey": "sys:showText",
  "inputParams": {
    "type": "NO_WAIT",
    "text.var": "内容",
    "title": "日志"
  },
  "outputParams": {
    "isSuccess": "成功",
    "windowHandle": "窗口句柄"
  }
}
```

### 等待关闭并返回编辑结果

```json
{
  "stepRunnerKey": "sys:showText",
  "inputParams": {
    "type": "WAIT",
    "text.var": "草稿",
    "title": "编辑文本",
    "operations": "确定|ok\n取消|cancel"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultText": "结果文本",
    "selectedOperation": "选择的操作"
  }
}
```

### 获取窗口信息

```json
{
  "stepRunnerKey": "sys:showText",
  "inputParams": {
    "type": "GET_WIN_INFO",
    "autoCloseKey.var": "窗口标识"
  },
  "outputParams": {
    "isWindowExists": "窗口存在",
    "windowPosition": "窗口位置"
  }
}
```

## 陷阱

- `type`: `NO_WAIT`/`WAIT`/`CLOSE_WINDOW`/`GET_WIN_INFO`/`APPEND_TEXT` 等；`autoCloseKey` 默认同动作 id（`=`）。
- `WAIT` 取 `resultText`/`selectedText`/`selectedOperation`；`highlight` 支持 Json/MarkDown/C# 等语法高亮。
- 写步骤前 `get --control-field WAIT` 等。

## 相关

outputText · stateStorage · showImage · step-runner-get
