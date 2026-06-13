# sys:each

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[each](https://getquicker.net/KC/Help/Doc/each)

**用途**：遍历列表，子步骤内使用 `item`（当前项）与 `count`（序号）输出变量。

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

## 陷阱

- 默认 `useMultiThread: "0"` 单线程；多线程模式变量写入受限（`useLocalContext` 时 mostly 只读），**通常不要启用**除非已读 KC 多线程说明。
- 子步骤内用 `break` 结束整个循环、`continue` 跳过本次剩余步骤进入下一项；`progressBarTitle` 仅单线程有效。
- 列表来源用 `input.var`；空列表时子步骤不执行。

## 相关

repeat · break · continue · if · listOperations · step-runner-get
