# sys:if

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[if](https://getquicker.net/KC/Help/Doc/if)

**用途**：按布尔条件执行 Then 分支，可选 Else 分支（子步骤挂在分支 children 内）。

## 示例

### 数值比较

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={数量} > 0"
  }
}
```

### 文本非空

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$=!String.IsNullOrWhiteSpace({路径})"
  }
}
```

### 多条件组合

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={已启用} && {计数} >= 3"
  }
}
```

## 陷阱

- `condition` 为 Boolean 类型参数，表达式须 **`$=` 前缀**（与普通 `evalexpression` 步骤不同）。
- Then/Else 子步骤分别挂在 if 步骤的 **children** 结构；无 Else 时仅 Then 分支。
- 单条件无 Else 可用 `sys:simpleIf`；复杂赋值优先 `evalexpression` 再 if 判断变量。

## 相关

simpleIf · evalexpression · expressions · break · continue · step-runner-get
