# sys:MsgBox

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[msgbox](https://getquicker.net/KC/Help/Doc/msgbox)

**用途**：弹出消息/确认对话框，根据 `result` 或 `okOrYes` 分支。

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
    "icon": "Asterisk"
  },
  "outputParams": {
    "result": "按钮"
  }
}
```

## 陷阱

- **交互式**步骤；`operation: default` 用 `icon`/`buttons` 枚举；`custom` 用 `customButtons` 多行（`[图标]文本|返回值`）+ `defaultButton`。
- `message` 支持 `MD:` 前缀 Markdown；`restoreFocus: true` 关闭后还原原前台窗口。
- 轻量通知无阻塞用 `notify`；多选项菜单用 `showmenu`/`select`。

## 相关

notify · select · showmenu · if · step-runner-get
