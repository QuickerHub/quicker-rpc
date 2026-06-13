# sys:break

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[break](https://getquicker.net/KC/Help/Doc/break)

**用途**：在 `each` / `repeat` 循环内跳出，结束循环。

## 示例

### 条件满足时跳出循环

置于 `sys:each` / `sys:repeat` 子步骤内；无 input/output。

```json
{
  "stepRunnerKey": "sys:break"
}
```

### 配合 if：列表遍历遇目标即 break

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={当前项} == {目标值}"
  }
}
```

Then 分支内接：

```json
{
  "stepRunnerKey": "sys:break"
}
```

## 陷阱

- 无参数；仅作用于 enclosing `each`/`repeat`，不是 `stop`（结束动作）。
- 与 `continue`（跳过本次迭代）区分。

## 相关

continue · each · repeat · if · step-runner-get
