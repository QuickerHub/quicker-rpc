# sys:dboperation

> **来源**：step JSON 示例 · **官方**：[dboperation](https://getquicker.net/KC/Help/Doc/dboperation)

**用途**：Dapper 执行 SQL（SQLServer/MySQL/SQLite 等）。

## 示例

### Query 查询

```json
{
  "stepRunnerKey": "sys:dboperation",
  "inputParams": {
    "dbType": "sqlite",
    "connectionString": "D:\\data\\app.db",
    "operationType": "Query",
    "sql": "SELECT id, name FROM users WHERE active = @Active",
    "sqlParam": "$$ {\"Active\": true}"
  },
  "outputParams": {
    "isSuccess": "成功",
    "listResult": "行列表",
    "rowCount": "行数"
  }
}
```

### Execute 更新

```json
{
  "stepRunnerKey": "sys:dboperation",
  "inputParams": {
    "dbType": "mysql",
    "connectionString": "Server=127.0.0.1;Database=app;Uid=user;Pwd=***;",
    "operationType": "Execute",
    "sql": "UPDATE users SET score = @Score WHERE id = @Id",
    "sqlParam": "$$ {\"Id\": 1, \"Score\": 100}"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rowsAffected": "影响行数"
  }
}
```

### ExecuteScalar 单值

```json
{
  "stepRunnerKey": "sys:dboperation",
  "inputParams": {
    "dbType": "sqlserver",
    "connectionString": "Server=.;Database=app;Trusted_Connection=True;",
    "operationType": "ExecuteScalar",
    "sql": "SELECT COUNT(*) FROM orders"
  },
  "outputParams": {
    "isSuccess": "成功",
    "scalarResult": "计数"
  }
}
```
