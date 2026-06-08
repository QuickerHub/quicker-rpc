# sys:tableoperation

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[tableoperation](https://getquicker.net/KC/Help/Doc/tableoperation)

**用途**：读写 `DataTable` 表格变量（增删改查、筛选、导入导出）。

**何时读**：`get` 定「操作类型」后；筛选表达式、行数据词典形状前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 表格变量 | 变量名 | `DataTable` 类型 |
| 操作类型 | `controlField` | 各操作互斥参数见 get |
| 行数据 | 词典 列名→值 | 添加/更新行；自增列可省略 |
| 筛选表达式 | 行过滤 | 更新/删除多行时用 |

## 模式（常用操作）

| 操作 | 要点 |
|------|------|
| 获取信息 | 行数、Rows/Columns 对象 |
| 添加行 | 词典一行 |
| 更新行 | 行数据 + 筛选表达式 |
| 查看或编辑数据 | 弹 UI 编辑 |
| 筛选/排序/去重 | 表达式或列规则 |
| 与列表互转 | 导入 CSV/列表等 |

表格变量说明见 KC「表格变量类型」；常与 `dboperation` Query 衔接。

## 相关

dboperation · step-runner-get · implementation-fallback
