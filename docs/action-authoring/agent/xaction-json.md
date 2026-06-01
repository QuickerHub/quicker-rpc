# Compressed XAction（读模型）
`qkrpc_action_get` → `payload.compressed` + **`editVersion`**。
## return-mode
| Mode | 用途 |
|------|------|
| `structure` | 步骤树、stepId；无 inputParams |
| `full` | 写 patch 前的参数值；省略与 catalog 相同的普通默认（**控制字段保留**） |
| `metadata` | title、description、icon、stepOutline |
读模型**不能**代替 **`qkrpc_step_runner_get`**；写用 `qkrpc_action_patch` 最小 diff。
## 关键字段
| 字段 | 说明 |
|------|------|
| `stepId` | 临时 `s-1`…；patch 后用响应 **`addedSteps`**，勿仅为 id 再 get |
| `stepRunnerKey` | 目录 key |
| `inputParams` | 键名来自 step-runner schema |
| `nodePath` | `0`、`1/if/0`、`1/else/0` 等定位 |
| 变量 `key` | patch 稳定 id；写入用数字 **`type`**（**`variables`**） |
## 相关
`authoring-workflow`（P2）· `patch-workflow` · `overview`
