# sys:each

> **来源**：step JSON 示例 · **官方**：[each](https://getquicker.net/KC/Help/Doc/each)

**用途**：遍历列表，子步骤内可用 `item` / `count` 输出变量。

## 示例

### 顺序遍历列表

```json
{
  "stepRunnerKey": "sys:each",
  "inputParams": {
    "input.var": "文件列表",
    "useMultiThread": "0"
  },
  "outputParams": {
    "item": "当前项",
    "count": "序号"
  }
}
```

### 多线程遍历（慎用）

```json
{
  "stepRunnerKey": "sys:each",
  "inputParams": {
    "input.var": "任务列表",
    "useMultiThread": "1",
    "concurrentThreadNum": 4,
    "threadDelay": 5
  },
  "outputParams": {
    "item": "当前项",
    "isSuccess": "成功"
  }
}
```
