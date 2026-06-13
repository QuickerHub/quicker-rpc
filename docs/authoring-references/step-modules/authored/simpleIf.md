# sys:simpleIf

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[simpleif](https://getquicker.net/KC/Help/Doc/simpleif)

**用途**：按布尔条件分支（简化 if，子步骤挂在「是/否」下）。

## 示例

### 布尔条件

```json
{
  "stepRunnerKey": "sys:simpleIf",
  "inputParams": {
    "condition": "$={已启用}"
  }
}
```

### 文本比较

```json
{
  "stepRunnerKey": "sys:simpleIf",
  "inputParams": {
    "condition": "$={状态} == \"ready\""
  }
}
```

## 陷阱

- `condition` 为 Boolean；表达式用 `$=` 前缀（见 quicker-eval-expression skill）。
- 无输出参数；复杂多分支用 `if`/`switch` 模块；仅单条件二选一时用本模块。

## 相关

if · switch · evalexpression · step-runner-get
