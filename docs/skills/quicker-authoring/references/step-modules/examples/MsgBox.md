# sys:MsgBox

> **来源**：step JSON 示例 · **官方**：[msgbox](https://getquicker.net/KC/Help/Doc/msgbox)

**用途**：弹出消息框并根据用户点击分支。

## 示例

### 确认提示

```json
{
  "stepRunnerKey": "sys:MsgBox",
  "inputParams": {
    "operation": "default",
    "message": "确定要删除吗？",
    "title": "确认",
    "icon": "Question",
    "buttons": "YesNo"
  },
  "outputParams": {
    "result": "按钮",
    "okOrYes": "是否确认"
  }
}
```

### 信息提示

```json
{
  "stepRunnerKey": "sys:MsgBox",
  "inputParams": {
    "operation": "default",
    "message.var": "提示内容",
    "icon": "Information"
  },
  "outputParams": {
    "result": "按钮"
  }
}
```
