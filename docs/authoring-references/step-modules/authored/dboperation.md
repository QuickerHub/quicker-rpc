# sys:dboperation

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[dboperation](https://getquicker.net/KC/Help/Doc/dboperation)

**用途**：Dapper 执行 SQL（SQLServer/MySQL/SQLite/OleDb/ODBC）。

**何时读**：`get` 定「执行方式」后；连接串简写、SQL 参数绑定时。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 连接字符串 | 完整串或简写 | SQLite → 直接 `.db` 路径；Access → `.mdb`/`.accdb` 路径 |
| SQL语句 | 文本 | 参数 `@Name` |
| 参数 | 词典 / 多行 `名:值` / JSON / `$=` 匿名对象 | 键名**不带** `@` |
| 执行方式 | Query / Execute / ExecuteScalar | 决定输出形态 |

## 模式（执行方式 → 输出）

| 方式 | 输出 |
|------|------|
| Query | DataTable「查询结果（表格）」或对象列表 |
| Execute | 影响行数 |
| ExecuteScalar | 单值 |

更新/删除谨慎；空结果集不一定算失败。

## 相关

tableoperation · step-runner-get · implementation-fallback
