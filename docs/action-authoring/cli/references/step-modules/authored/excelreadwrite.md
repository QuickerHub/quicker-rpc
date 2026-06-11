# sys:excelreadwrite

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[excelreadwrite](https://getquicker.net/KC/Help/Doc/excelreadwrite)

**用途**：NPOI 打开/创建/保存 Excel 工作簿（`.xls`/`.xlsx`）。

**何时读**：`get` 定操作后；工作簿对象在步间传递、保存时机前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | `controlField` | 打开/创建/保存/关闭等 |
| 文件路径 | 打开或保存目标 | |
| 工作簿对象 | 对象变量 | **后续步**读写单元格前须持有 |
| 工作簿类型 | XSSF 推荐 | 与扩展名 `.xlsx` 一致；HSSF 功能受限 |

## 模式（典型链）

1. **打开Workbook** → 输出 `工作簿对象`（常带首表对象、行号范围）
2. **excelRange** / **excelObjects** 读写单元格
3. **保存工作簿** → 变更才落盘；覆盖重要文件先备份

「已存在具有相同键的条目」→ 工作簿含完全空 sheet。

保存仅适合自动生成文档；NPOI 可能丢部分 Excel 特性。

## 相关

excelRange · excelObjects · fileOperation · step-runner-get
