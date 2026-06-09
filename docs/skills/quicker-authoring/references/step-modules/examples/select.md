# sys:select

> **来源**：step JSON 示例 · **官方**：[userselect](https://getquicker.net/KC/Help/Doc/userselect)

**用途**：让用户从列表中单选或多选一项。

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

### 启用筛选

```json
{
  "stepRunnerKey": "sys:select",
  "inputParams": {
    "type": "single",
    "prompt": "选择城市",
    "items.var": "城市列表",
    "showFilter": "1",
    "enableQuickConfirm": "1"
  },
  "outputParams": {
    "textValue": "选择的项"
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
