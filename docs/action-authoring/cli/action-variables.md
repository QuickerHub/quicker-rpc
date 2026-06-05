# 动作变量

**何时读**：编辑 `data.json` 里的 **`variables[]`**。与步骤的绑定见 **`action-steps`**；表达式与插值见 **`expressions`**。

## 编写时用的字段

`variables[]` 每项按下面形状写即可（与 `action get` 压缩后的工作区 JSON 一致）：

| 字段 | 说明 |
|------|------|
| `key` | 变量名；步骤里 `varKey`、表达式 `{name}` 都引用这个字符串 |
| `varType` | 类型：**小写英文字符串**，见下表；**文本变量省略本字段** |
| `defaultValue` | 内联字符串，或 `{ "file": "files/…" }` 外置，见下文；**文本 / 任意类型勿省略**（应写 `""`） |
| `desc` | 说明（可选） |
| `isInput` / `isOutput` / `isLocked` / `saveState` 等 | 可选元数据，需要时再写 |

稳定标识是 **`key`**。条目里若带有 **`id`**，是导出/编辑器用的行 id，改类型或默认值时**不必**改 `id`，也不要用 `id` 当变量名。

## `varType`

| `varType` | 含义 |
|-----------|------|
| *(省略)* | 文本（默认） |
| `number` | 数值 |
| `boolean` | 布尔 |
| `integer` | 整数 |
| `table` | 表格 |
| `list` | 列表 |
| `dict` | 词典 |
| `enum` | 枚举 |
| `datetime` | 日期时间 |
| `image` | 图片 |
| `object` | 对象 |

示例：

```json
{ "key": "count", "varType": "integer", "defaultValue": "0" }
{ "key": "title", "defaultValue": "" }
```

**文本**（省略 `varType` 即文本）与 **`varType: "any"`**：在 Quicker 运行时若**不写** `defaultValue`，初始化值为 **`null`**（不是 `""`），表达式读取 `{var}` 时会告警且易与步骤输出混淆。**必须**写 `"defaultValue": ""`，除非使用 `defaultValue.file` 外置默认值。保存 / 导出 / patch 时工具链会自动补全；手写 `data.json` 请显式写上。

## 阅读时可能见到的其它字段

从 Quicker 或其它工具拿到的 JSON 里，类型有时还会以别的键出现；含义与上表 `varType` 相同，**你写入时仍用 `varType` 字符串（或文本则省略）**：

| 字段 | 含义 |
|------|------|
| `type` | 与 Quicker `VarType` 相同的**数字**（如 `0` 文本、`12` 整数） |
| `Type` | 同上，PascalCase 旧写法 |
| `var_type` | 同 `varType`，蛇形命名 |

`defaultValue` 若见到顶层 **`defaultValueFile`**（字符串路径），等价于现在的 `"defaultValue": { "file": "…" }`；新内容请用 `{ "file" }` 形状。

## `defaultValue`

**形状（二选一）**：

| 形状 | 示例 |
|------|------|
| 内联 **字符串** | `"defaultValue": "42"`、`"true"`、`"$$Hello {name}"` |
| 外置 **对象** | `"defaultValue": { "file": "files/myvar-default1.txt" }` |

- 与 `inputParams` 的 `{ "file": "…" }` **同形**；路径相对动作项目目录，`/` 分隔，路径段中不含 `..`。
- **`defaultValue` 二选一**：内联字符串 **或** `{ "file": "…" }`（不要两种同时写）。
- 长默认值（超过约 **4 行** 或 **240 字符**）宜用 `defaultValue.file`，例如 `files/{key}-default1.txt`。

内联字符串若需运行时插值或求值，前缀规则与 **`inputParams.value`** 相同（`$$` / `$=`），见 **`expressions`**。

## 与步骤的关系

- **读入步骤**：`inputParams` 下 `{ "varKey": "<key>" }`（值为变量 **key** 字符串，不是表达式）。
- **写出步骤**：`outputParams` 各键的值为 **字符串**（目标变量 key，可 `dictVar.entry`），不是 `{ "varKey": "…" }` 对象，见 **`action-steps`**。
- **表达式**：在 `value` 等字符串里写 `{count}` 引用变量；表达式引擎内部会映射为 `v_count`，**`data.json` 里仍写 `{count}`**，见 **`expressions`**。

## `quicker_in_param`

运行入参 **`quicker_in_param`** 由 Quicker 注入，**不**在 `variables[]` 里声明；在表达式里直接用 `{quicker_in_param}`，见 **`expressions`**。

## 相关

`action-steps` · `expressions` · `action-project-files` · `overview`
