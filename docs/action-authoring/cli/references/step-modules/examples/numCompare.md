# sys:numCompare

> **来源**：step JSON 示例 · **官方**：[numcompare](https://getquicker.net/KC/Help/Doc/numcompare)

**用途**：比较两个数字的大小关系（供 `sys:if` 等使用）。

## 示例

### 大于判断

```json
{
  "stepRunnerKey": "sys:numCompare",
  "inputParams": {
    "param1.var": "数量",
    "type": ">",
    "param2": "0"
  }
}
```

### 区间上界

```json
{
  "stepRunnerKey": "sys:numCompare",
  "inputParams": {
    "param1.var": "得分",
    "type": "<=",
    "param2.var": "满分"
  }
}
```
