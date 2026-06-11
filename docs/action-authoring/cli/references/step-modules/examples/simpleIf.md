# sys:simpleIf

> **来源**：step JSON 示例 · **官方**：[simpleif](https://getquicker.net/KC/Help/Doc/simpleif)

**用途**：按 `$=` 条件分支（简化版 if）。

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

### 数值范围

```json
{
  "stepRunnerKey": "sys:simpleIf",
  "inputParams": {
    "condition": "$={计数} >= 1 && {计数} <= 10"
  }
}
```
