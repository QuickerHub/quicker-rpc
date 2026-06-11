# sys:excelRange

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[excelrange](https://getquicker.net/KC/Help/Doc/excelrange)

**用途**：Interop Excel 读写 Range（须本机装 Excel）。

**何时读**：区域字符串、`限定子范围`、与 NPOI 链选型前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 区域 | Range 对象 / 空=选区 / `used` / `A1:E9` | |
| 限定子范围 | 首行/末列/活动单元格/EntireRow 等 | 在「区域」上再收窄 |
| 工作簿来源 | 仅 Quicker 打开的 Excel | 资源管理器双击开的窗**不可**控 |

编程改表后 Excel **无 Undo**；改前保存备份。

文件级读写无 Excel 安装 → **`excelreadwrite`**（NPOI）。

## 相关

excelObjects · excelreadwrite · officehelper · step-runner-get
