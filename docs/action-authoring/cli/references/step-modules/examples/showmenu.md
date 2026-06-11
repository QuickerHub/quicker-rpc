# sys:showmenu

> **来源**：step JSON 示例 · **官方**：[showmenu](https://getquicker.net/KC/Help/Doc/showmenu)

**用途**：弹出菜单供用户点选。

## 示例

### 基础菜单

```json
{
  "stepRunnerKey": "sys:showmenu",
  "inputParams": {
    "menuData": "复制|copy\n粘贴|paste\n---\n退出|quit",
    "waitMenuClose": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "selectedItem": "选中项",
    "selectedItemData": "选中值"
  }
}
```

### 带图标并等待

```json
{
  "stepRunnerKey": "sys:showmenu",
  "inputParams": {
    "menuData": "[fa:Solid_Copy]复制|copy\n[fa:Solid_Paste]粘贴|paste",
    "fontsize": "14",
    "useFocus": "1",
    "waitMenuClose": "1"
  },
  "outputParams": {
    "selectedItemData": "选中值",
    "clickButton": "点击按钮"
  }
}
```
