# sys:listOperations

> **来源**：step JSON 示例 · **官方**：[listoperations](https://getquicker.net/KC/Help/Doc/listoperations)

**用途**：列表增删改查、排序、过滤与合并。

## 示例

### 追加元素

```json
{
  "stepRunnerKey": "sys:listOperations",
  "inputParams": {
    "list.var": "列表",
    "type": "append",
    "item.var": "新项"
  },
  "outputParams": {
    "value": "结果列表"
  }
}
```

### 按包含过滤

```json
{
  "stepRunnerKey": "sys:listOperations",
  "inputParams": {
    "list.var": "文件列表",
    "type": "filterByContains",
    "pattern.var": "关键词"
  },
  "outputParams": {
    "value": "过滤结果",
    "filterOutItems": "被排除项"
  }
}
```

### 合并两个列表

```json
{
  "stepRunnerKey": "sys:listOperations",
  "inputParams": {
    "list.var": "列表A",
    "type": "concat",
    "list2.var": "列表B"
  },
  "outputParams": {
    "value": "合并列表"
  }
}
```
