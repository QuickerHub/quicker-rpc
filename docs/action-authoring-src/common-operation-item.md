# {{#topic-title}}

**何时读**：编辑动作的 **右键菜单定义**（`ContextMenuData`），或需要理解 Quicker 里同形的 **操作项多行文本**（变量/步骤参数里的 `SelectionItems`、表单下拉、`sys:custompanel` 的 `contextMenuData` 等）。

## 是什么

**CommonOperationItem** 是 Quicker 内置的「菜单项 / 选项项」模型。设计器里通常以 **多行纯文本** 编辑；运行时由 `CommonOperationItem.ParseLines` 或 `ParseLinesWithSubItems` 解析为对象列表。

本专题描述该 **文本语法**。动作右键菜单是最常见的元数据用途；步骤参数与变量枚举复用同一套 **显示部分** 规则（`[图标]标题(提示)|值`），子菜单与 `operation=` 高级写法多见于菜单类场景。

## 动作右键菜单（`ContextMenuData`）

| 项 | 说明 |
|----|------|
| Quicker 字段 | `ActionItem.ContextMenuData`（字符串，**每行一项**；设计器文本框 **最长约 1500 字符**） |
| 触发 | 用户在面板/搜索等场景对动作 **右键** → 选中自定义项 → 以 **`ActionTrigger.ContextMenu`** 运行动作 |
| 传参 | 该项 **`\|` 右侧** 的 **数据部分** 作为本次运行的 **`quicker_in_param`**（无则为空字符串），见 **`expressions`** |
| 设计器 | 动作选项 →「右键菜单定义」；可用「操作设计器」可视化编辑（输出缩进文本） |

**典型一行**（与 Quicker 设计器示例一致）：

```text
[fa:Light_Cog:#FF0000]设置(打开动作设置)|settings
```

用户点「设置」后，动作内 `{quicker_in_param}` 为 `settings`，可用 `$=` / `$$` / `sys:evalexpression` 分支处理。

## 单行格式

```text
[图标]标题(提示文字)|数据部分
```

| 段 | 必填 | 说明 |
|----|------|------|
| `[图标]` | 否 | 见下文「图标」；可含 `#RRGGBB` 着色（如 `fa:Light_Cog:#FF0000`） |
| `标题` | 建议有 | 菜单上显示的文字 |
| `(提示文字)` | 否 | 悬停 tooltip；括号须为 **最外层** 一对（见「标题与提示」） |
| `\|` | 视场景 | **显示** 与 **数据** 的分隔符；默认 `\|`，可用 `\|=` 自定义 |
| `数据部分` | 否 | 右键菜单下多为 **普通字符串**；亦支持 `operation=…&…` 查询串（见下文） |

**无 `\|` 时**：整行视为显示文本，**数据部分 = 标题**（右键菜单仍会传入该标题字符串）。

**空行**：忽略。**注释行**：以 `////` 开头，整行忽略。

## 图标

仅当行首为 `[` 且匹配下列前缀时，方括号段解析为图标（其余 `[文字]` **不** 当图标，避免误伤标题）：

| 前缀 | 示例 |
|------|------|
| `fa:` | `[fa:Light_AddressBook]`、`[fa:Solid_Pen:#008000]` |
| `url:` | `[url:https://example.com/icon.png]` |
| `icon:` | `[icon:d:\path\app.exe]`（路径可含 `[]`，按嵌套括号匹配结束 `]`） |
| `previmg:` | 预览图 |
| `shellicon:` | Shell 图标 |
| `action:` | 引用另一动作图标 |
| `text:` | 文本图标 |

图标 spec 与动作元数据图标相同规则：**`action-icons`** / `qkrpc fa search`。

## 标题与提示 `(tooltip)`

解析顺序：先去掉 `[图标]`，再对剩余文本做 `标题(提示)` 拆分。

- 从 **右侧** 匹配 **最外层** 一对 `(` `)`；提示为括号内文本。
- **不** 把下列情况当 tooltip：
  - 以 `s (x86)` 结尾的路径（如 `Program Files (x86)`）
  - 快捷键标记 `(_X)`（倒数第 4 字符为 `(` 且第 3 字符为 `_`）
  - 行尾无 `)` 或括号不配平

提示中的字面量 `\r\n` 会转为换行显示。

## 分隔符 `|=`

首条有效行（或子菜单解析前的首行）可为：

```text
|=::
```

则后续各行用 `::` 代替 `|` 分隔显示与数据（值本身可含 `|`）。**空分隔符非法**。

## 分隔线

单独一行：

```text
----
```

解析为菜单分隔线（`IsSeparator`）。

## 子菜单

支持两种写法（右键菜单、自定义面板等使用 **`ParseLinesWithSubItems`**）：

### `[+]` / `[-]` 前缀

```text
[+]父菜单(带子项)
[-]子项一|child1
[-]子项二|child2
另一顶层项|top
```

- `[+]`：**父项**（可有图标/提示）；其后 `[-]` 行挂到该父项的 **Children**。
- `[-]`：**子项**；若前面没有 `[+]` 父项则忽略。
- 无 `[+]`/`[-]` 的行均为 **顶层** 项。

父项仅有子菜单、且数据等于标题时，序列化可省略 `\|数据` 段。

### 缩进层级

任一行以空格/Tab 缩进时，整份文本走 **缩进解析**（与操作设计器导出一致）：

- 子层级：增加缩进（每级通常 2 空格）。
- 以 `- ` 开头的缩进行 → 该项的 **Menu**（对象上的右键子菜单），而非 Children。

## 数据部分

### 动作右键菜单（常用）

**普通字符串**即可，会原样成为 `quicker_in_param`：

```text
模式A|modeA
[fa:Light_Trash]删除(危险操作)|delete
```

动作程序内示例：

```text
$=string.Equals({quicker_in_param}, "delete", StringComparison.OrdinalIgnoreCase)
```

### `operation=` 查询串（高级）

当数据段含 `operation=`（不区分大小写）时，按 **URL 查询串** 解析，映射到 `Operation`、`Data`、`DataType`、`Action`、`SpName` 及 `ExtraData`：

```text
复制|operation=copy&data={selectedText}
执行子程序|operation=sp&spname=MySub&data=arg1
```

用于搜索结果右键、自定义面板按钮菜单等；**动作自带右键菜单** 一般只需 plain 字符串或后续在步骤里再 `sys:runaction`。

常见 `operation` 值（完整表在 Quicker `CommonOperationTypes`）：`copy`、`paste`、`run`、`action`（执行动作）、`sp`（子程序）、`inputtext`、`sendkeys` 等。

## 完整示例（动作右键）

```text
//// 以下为自定义项；上方 Quicker 仍会附加编辑/调试等系统菜单
[fa:Light_Play]快速运行(等同左键)|quick
[fa:Light_Cog:#3b82f6]设置|settings
----
[+]高级
[-][fa:Light_FileExport]导出|export
[-][fa:Light_FileImport]导入|import
重置|reset
```

## 与 `SelectionItems` 的关系

变量 `InputParamInfo.SelectionItems`、部分步骤枚举参数、表单 `SelectionItems` 使用 **同一显示语法**，但通常调用 **`ParseLines`**（**无** `[+]`/`[-]` 子菜单，分隔线需整行为 `----` 且 `enableSeparator`）。

| 场景 | 解析 | 子菜单 | 数据含义 |
|------|------|--------|----------|
| 动作 `ContextMenuData` | `ParseLinesWithSubItems` | 支持 | → `quicker_in_param` |
| 变量/步骤下拉 `SelectionItems` | `ParseLines` | 不支持 | 选项 **value**（`\|` 右侧） |
| `qkrpc.form.v1` 的 `select` | 编译为 `value\|label` 行 | 不支持 | 表单字段值 |

表单外置 spec 见 **`form-spec`**。

## 无头编辑（qkrpc）

- 读取：{{@ action.get.metadata}} 响应中的展示字段（实现扩展后含 `contextMenuData`）；工作区 **`info.json`** 同步该字段。
- 写入：与 `title` / `description` / `icon` 同类元数据，经 **`action set-metadata`** 或 patch 顶层字段保存（**不**改 `data.json` 程序体）。
- 图标：须 `fa search` 取得 spec，勿猜。

步骤内动态菜单（如 `sys:custompanel` 的 `contextMenuData`）写在 **`data.json` 步骤 `inputParams`**，语法相同，见 **`action-steps`** + **`step-runner-get`**。

## 常见错误

| 现象 | 原因 |
|------|------|
| tooltip 被截断或错位 | 标题中含未转义的 `)`；或路径 `(x86)` 被误解析（引擎已排除常见路径） |
| 图标不显示 | 前缀不在 `fa:`/`url:`/`icon:` 等列表；或 `fa:` 拼写错误 |
| 子项不出现 | 用了 `[-]` 但前面没有 `[+]` 父行 |
| 点击后分支不对 | 应用 `{quicker_in_param}` 比较 **数据段** 字符串，不是标题 |
| 与步骤枚举混淆 | 下拉选项无子菜单；长脚本应放 `files/` 而非塞进菜单定义 |

## 相关

`expressions` · `action-steps` · `form-spec` · `authoring-workflow`（P3 元数据）· `overview`
