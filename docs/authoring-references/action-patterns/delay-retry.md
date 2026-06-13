# 延迟与重试

> **场景**：轮询等待条件满足，失败间隔 delay 后重试 · **难度**：M · **exemplar**：`__pattern_learning__delay_retry` trace ✅

## 何时用

HTTP/文件/进程就绪前需要「试 N 次、每次间隔等待」；与 **http-json-api** 的区别：本模式是通用控制流；与 **loop-control** 的区别：用 **`repeat` 固定次数** + 内部 `break`，不是 `each` 遍历列表。

## 步骤骨架

1. **repeat** — `count` = 最大尝试次数；`repeatDelayMs` 轮间间隔
2. **尝试操作** — `checkPathExists` / `http` / `checkProcessExists` 等
3. **simpleIf 成功** — True 分支设结果变量 + **`break`**
4. **delay** — 本轮失败后的等待（`delayMs`）
5. **循环外收尾** — `showText` / 错误提示

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 循环序号 | `loopCount` | Number |
| 成功标志 | `ok` / `done` | Boolean |
| 结果 | `result` | Text |

## 示例（trace ✅）

无头：`repeat`×3，第 3 轮（`loopCount>=2`）设 `RETRY_OK` 并 `break`；前两轮各 `delay` 30ms + `repeatDelayMs` 50ms。

Patch：`.local/patch-delay-retry.json`

### 最小 patch（核心循环）

```json
{
  "stepRunnerKey": "sys:repeat",
  "inputParams": { "count": "3", "repeatDelayMs": "50" },
  "outputParams": { "count": "loopCount" },
  "ifSteps": [
    {
      "stepRunnerKey": "sys:simpleIf",
      "inputParams": { "condition": "$={loopCount} >= 2" },
      "ifSteps": [
        {
          "stepRunnerKey": "sys:evalexpression",
          "inputParams": { "expression": "{result} = \"RETRY_OK\";" }
        },
        { "stepRunnerKey": "sys:break" }
      ]
    },
    {
      "stepRunnerKey": "sys:delay",
      "inputParams": { "delayMs": "30" }
    }
  ]
}
```

## 陷阱

- `repeat` 子步骤在 **`ifSteps`**（与 `each` 相同 wire）。
- 成功分支末尾必须 **`break`**，否则打满 `count`。
- 也可用 `stopCondition: $={done}` 在 repeat 层提前中止（每轮开始检查）。
- 真实场景把 `simpleIf` 条件换成 `checkPathExists` 的 `exists` 或 HTTP 状态变量。
- `count: -1` 无限循环务必配 `stopCondition` 或 `break`。

## 相关

repeat · delay · simpleIf · break · checkPathExists · http · delay-retry
