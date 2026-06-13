# sys:listOperations

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[listoperations](https://getquicker.net/KC/Help/Doc/listoperations)

**用途**：列表 CRUD、排序、过滤、拼接（复杂 LINQ 优先 `evalexpression`）。

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
    "length": "长度"
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
    "item.var": "关键词"
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

## 陷阱

- 原地修改用 `list.var`；`sortAsc`/`sub`/`concat`/`distinct`/`filter*` 等到 **`value`** 新列表，不一定写回原变量。
- `pos` 从 0 起，负数从尾部计；`indexOf` 未找到时 `index` 为 -1。
- 文件路径列表排序用 `FileSizeAsc` 等专用 type；正则筛选用 `filterByRegex` + `pattern`。

## 相关

each · joinList · splitString · evalexpression · step-runner-get · implementation-fallback
