# sys:uiautomation

> **来源**：step JSON 示例 · **官方**：[uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：通过 UIAutomation 定位并操作 Win32 控件。

## 示例

### 触发菜单

```json
{
  "stepRunnerKey": "sys:uiautomation",
  "inputParams": {
    "type": "TriggerMenu",
    "window.var": "目标窗口",
    "menuPath": "文件->打开",
    "expandDelay": "200"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 点击控件

```json
{
  "stepRunnerKey": "sys:uiautomation",
  "inputParams": {
    "type": "TriggerControl",
    "window.var": "目标窗口",
    "control": "确定",
    "controlType": "Button",
    "controlOperation": "Invoke"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 读取控件信息

```json
{
  "stepRunnerKey": "sys:uiautomation",
  "inputParams": {
    "type": "GetControlInfo",
    "window.var": "目标窗口",
    "control.var": "控件名称",
    "controlType": "Edit"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "值",
    "controlText": "文本",
    "rect": "区域"
  }
}
```

### 光标处控件

```json
{
  "stepRunnerKey": "sys:uiautomation",
  "inputParams": {
    "type": "GetCursorPointControlInfo"
  },
  "outputParams": {
    "controlName": "名称",
    "controlType": "类型",
    "controlText": "文本",
    "rect": "区域"
  }
}
```
