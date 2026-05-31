# Overview



无头编辑 XAction：**`qkrpc` CLI**（`qkrpc help --json`）。**完整流程约束见 `authoring-workflow`**。环境：**`cli-setup`**。



## Workflow（摘要）



1. **`action list`** / **`action search`** → `actionId`（新动作在 Quicker UI 创建）。

2. **`action get`** → `editVersion`；`structure` 扫树，`full` 读非默认参数。

3. **`guide get --topic implementation-fallback`** → 表达式优先，再考虑专用步骤。

4. 每个专用步骤：**`step-modules`** → 否则 **`step-runner search`** → **`step-runner get`**（必须，禁止猜 `inputParams` 键）。

5. 表达式参数值：**`expressions`**。

6. **`action patch`** 一次保存；用响应里的 `editVersion` / `addedSteps`，**不要**仅为验证再 `action get`。



## Rules



| Rule | Detail |

|------|--------|

| Read before write | 改已有动作前先 `action get` |

| Minimal patch | 省略未改的 steps、variables、`inputParams` 键；新建步骤时省略与目录 `Default` 相同的**普通**参数；**控制字段保留** |

| Schema-driven | `stepRunnerKey` 与 `inputParams` 键来自 **`step-runner get`** |

| Ephemeral `stepId` | 插入后用 patch 响应的 `addedSteps` 或 `nodePath` |

| No post-patch re-read | 成功 patch 后以响应为准 |

| Read compression | `action get --return-mode full` 省略目录默认的普通参数；**控制字段始终保留** |

| Fallback | 搜不到模块见 **`implementation-fallback`** |



## User summary



汇报：`actionId`、`stepRunnerKey`、改了什么、`editVersion` 或错误与重试建议。



## Topics



`authoring-workflow` · `implementation-fallback` · `step-modules` · `step-runner-search` · `cli-setup` · `xaction-json` · `variables` · `expressions` · `patch-workflow`

