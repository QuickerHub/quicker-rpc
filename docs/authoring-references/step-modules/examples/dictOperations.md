# sys:dictOperations

> **来源**：step JSON 示例 · **官方**：[dictoperations](https://getquicker.net/KC/Help/Doc/dictoperations)

**用途**：词典读写、键列表、查询串互转等。

## 示例

### 读取键值

```json
{
  "stepRunnerKey": "sys:dictOperations",
  "inputParams": {
    "type": "get",
    "dict.var": "配置",
    "key": "apiUrl"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "值"
  }
}
```

### 写入键值

```json
{
  "stepRunnerKey": "sys:dictOperations",
  "inputParams": {
    "type": "setOriginValue",
    "dict.var": "配置",
    "key": "token",
    "value.var": "新令牌"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 查询串转词典

```json
{
  "stepRunnerKey": "sys:dictOperations",
  "inputParams": {
    "type": "queryStringToDict",
    "queryString": "mode=Bear&code=Decode&txt=hello"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "词典"
  }
}
```
