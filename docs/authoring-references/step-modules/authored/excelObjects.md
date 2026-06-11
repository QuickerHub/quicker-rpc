# sys:excelObjects

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[excelobjects](https://getquicker.net/KC/Help/Doc/excelobjects)

**用途**：Interop 打开/创建/切换 Excel 工作簿与工作表对象。

**何时读**：拿 `Application`/`Workbook`/`Worksheet` 对象给 `excelRange` 前读。

## wire 要点

| 操作 | 输出对象 |
|------|----------|
| 打开/创建工作簿 | Workbook、Worksheets 列表 |
| 获取当前应用信息 | ActiveWorkbook、ActiveSheet、Application |

仅控制**本模块打开**的 Excel 实例（权限限制）。预览状态，API 可能变动。

典型链：`excelObjects` 打开 → `excelRange` 读写 → 保存/关闭。

## 相关

excelRange · excelreadwrite · step-runner-get
