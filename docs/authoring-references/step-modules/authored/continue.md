# sys:continue

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[continue](https://getquicker.net/KC/Help/Doc/continue)

**用途**：在 `each` / `repeat` 循环内跳过本次剩余步骤，进入下一次迭代。

## 示例

### 循环内 continue

```json
{
  "stepRunnerKey": "sys:continue"
}
```

### 配合 if：跳过空项

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$=String.IsNullOrWhiteSpace({当前项})"
  }
}
```

Then 分支内：

```json
{
  "stepRunnerKey": "sys:continue"
}
```

## 陷阱

- 无 input/output；须放在循环体子步骤中。
- 与 `break`（退出整个循环）区分。

## 相关

break · each · repeat · if · step-runner-get
