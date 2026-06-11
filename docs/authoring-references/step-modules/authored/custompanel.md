# sys:custompanel

> **分类**：界面交互 · **来源**：仓库手写 · **官方**：[custompanel](https://getquicker.net/KC/Help/Doc/custompanel)

**用途**：浮动操作面板（多按钮、可重复点、不自动关）。

**何时读**：`get` 定操作后；编写「操作项定义」多行 DSL 前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | 显示/等待关闭/关闭/切换展开/取状态 | |
| 操作项定义 | 多行文本 | 格式近 `showmenu`；**无**分隔符 |
| 窗口标识 | 复用/关闭 | |
| operation=close&data= | 按钮行 | 「等待关闭」时带回传值 |
| operation=sp&spname= | 调动作内子程序 | |

## 模式（操作项布局）

- 平铺：全不带子项
- 分组：首层带子项；`[]` 占位；`__` 空分组标题（1.39.42+）
- 缩进定义子项（见 KC 示例图）

最多一级子项；右侧 `[>]` 展开子菜单。

## 相关

showmenu · subprogram · customwindow · step-runner-get
