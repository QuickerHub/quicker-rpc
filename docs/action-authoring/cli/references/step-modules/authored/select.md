# sys:select

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[userselect](https://getquicker.net/KC/Help/Doc/userselect)

**用途**：弹出列表让用户单选或多选。

## 示例

### 单选

```json
{
  "stepRunnerKey": "sys:select",
  "inputParams": {
    "type": "single",
    "prompt": "选择格式",
    "items": "短日期|d\n长日期|D\n时间|T",
    "defaultValue": "d"
  },
  "outputParams": {
    "isSuccess": "成功",
    "textValue": "选择的项",
    "selectedIndex": "索引号"
  }
}
```

### 多选

```json
{
  "stepRunnerKey": "sys:select",
  "inputParams": {
    "type": "multi",
    "prompt": "选择标签",
    "items": "工作|work\n个人|personal\n待办|todo",
    "defaultValueMulti.var": "默认选中"
  },
  "outputParams": {
    "isSuccess": "成功",
    "multiSelected": "多选结果",
    "selectedIndexList": "索引列表"
  }
}
```

### 带右键菜单

```json
{
  "stepRunnerKey": "sys:select",
  "inputParams": {
    "type": "single",
    "prompt": "操作",
    "items": "打开|open\n编辑|edit",
    "operations": "刷新|refresh\n[=]设置|settings"
  },
  "outputParams": {
    "textValue": "选择的项",
    "extraOperation": "选择的菜单"
  }
}
```

## 陷阱

- `items` 每行 `显示|值`；单选用 `defaultValue`，多选用 `defaultValueMulti`（多行）。
- `textValue` 为**值**列；`selectedItemTitle` 为显示文本；`stopIfCancel` 取消时是否停动作。
- 交互模块 `liveRun: false`；写步骤前 `get --control-field single|multi`。

## 相关

userInput · textSelectTools · selectFile · step-runner-get
