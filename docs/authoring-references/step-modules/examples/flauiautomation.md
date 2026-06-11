# sys:flauiautomation

> **来源**：step JSON 示例 · **官方**：[uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：FlaUI 触发窗口菜单/控件或读取控件信息。

## 示例

### 触发窗口菜单

```json
{
  "stepRunnerKey": "sys:flauiautomation",
  "inputParams": {
    "type": "TriggerMenu",
    "menuPath": "文件\n导出"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 单击按钮控件

```json
{
  "stepRunnerKey": "sys:flauiautomation",
  "inputParams": {
    "type": "TriggerControl",
    "control": "/Pane[1]/Button[@Name='确定']",
    "controlOperation": "LeftClick"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 获取控件文本

```json
{
  "stepRunnerKey": "sys:flauiautomation",
  "inputParams": {
    "type": "GetControlInfo",
    "control": "titleLabel"
  },
  "outputParams": {
    "isSuccess": "成功",
    "controlText": "标题文本",
    "controlXPath": "XPath"
  }
}
```
