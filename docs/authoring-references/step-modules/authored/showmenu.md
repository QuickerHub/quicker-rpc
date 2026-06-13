# sys:showmenu

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[showmenu](https://getquicker.net/KC/Help/Doc/showmenu)

**用途**：弹出上下文/快捷菜单供用户点选。

## 示例

### 基础菜单

```json
{
  "stepRunnerKey": "sys:showmenu",
  "inputParams": {
    "menuData": "复制|copy\n粘贴|paste\n---\n退出|quit",
    "waitMenuClose": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "selectedItemData": "选中值"
  }
}
```

### 带图标

```json
{
  "stepRunnerKey": "sys:showmenu",
  "inputParams": {
    "menuData": "[fa:Solid_Copy]复制|copy\n[fa:Solid_Paste]粘贴|paste",
    "useFocus": true,
    "waitMenuClose": true
  },
  "outputParams": {
    "selectedItemData": "选中值",
    "clickButton": "点击按钮"
  }
}
```

## 陷阱

- `menuData` 支持文本行（`显示|data`）、`---` 分隔线、JSON；也支持 `IList<CommonOperationItem>` 对象变量。
- `selectedItemData` 为菜单项 data；`waitMenuClose` 默认 true；交互模块 `liveRun: false`。

## 相关

select · showText · step-runner-get
