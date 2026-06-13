# sys:dictOperations

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[dictoperations](https://getquicker.net/KC/Help/Doc/dictoperations)

**用途**：词典 CRUD、键/值列表、查询串互转（复杂逻辑优先 `sys:evalexpression`）。

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

## 陷阱

- 写回词典用 `dict.var` 绑定变量；`set` 存文本，`setOriginValue` 保留变量原始类型（数字/布尔/列表等）。
- `get` + `returnEmptyIfKeyNotExist: true` 时键缺失不判失败；`ignoreCase` 仅影响键名比较。
- URL 参数解析用 `queryStringToDict`；需保留未编码字符用 `dictToQueryStringNoEncode`。

## 相关

evalexpression · jsonExtract · http · step-runner-get · implementation-fallback
