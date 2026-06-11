# sys:repeat

> **来源**：step JSON 示例 · **官方**：[repeat](https://getquicker.net/KC/Help/Doc/repeat)

**用途**：按次数重复执行子步骤，可选中止条件。

## 示例

### 固定次数循环

```json
{
  "stepRunnerKey": "sys:repeat",
  "inputParams": {
    "count": "10"
  },
  "outputParams": {
    "count": "当前序号"
  }
}
```

### 带中止条件

```json
{
  "stepRunnerKey": "sys:repeat",
  "inputParams": {
    "count": "100",
    "stopCondition": "$={完成}"
  },
  "outputParams": {
    "count": "当前序号"
  }
}
```
