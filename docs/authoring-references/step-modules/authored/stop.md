# sys:stop

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[stop](https://getquicker.net/KC/Help/Doc/stop)

**用途**：结束动作运行；子程序返回；或被 `runAction` 调用时返回值。

## 示例

### 正常结束并返回值

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "default",
    "return.var": "结果"
  }
}
```

### 错误停止

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "default",
    "isError": true,
    "showMessage.var": "错误信息"
  }
}
```

### 强制停止整个动作

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "forcestop",
    "showMessage": "已中止"
  }
}
```

## 陷阱

- `method`: `default`（子程序内仅退出子程序）/`forcestop`（终止整动作含子程序栈）。
- `return` 供 `runAction` 的 `output` 读取；`isError` 标记失败；无输出参数。
- 与 `break`/`continue`（循环控制）不同。

## 相关

runAction · subprogram · break · step-runner-get
