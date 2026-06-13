# 委托运行动作

> **场景**：主流程调用另一个已存在动作并等待结束 · **难度**：M · **exemplar**：`__pattern_learning__run_caller` trace ✅

## 何时用

编排层把子任务交给独立动作（参数经 `quicker_in_param`、输出经 `output`）；与 **subprogram-extract** 的区别：目标是**完整动作**而非子程序块；与 **subprogram** 的 `sys:subprogram` 不同。

## 步骤骨架

1. **准备目标动作** — 独立 `action create` + patch（或已有动作 id）
2. **runAction** — `type: StartAction`，`actionId` / `actionId.var`，`wait: True` 若要 `output`
3. **读结果** — `isSuccess`、`actionTitle`、`output` 映射到变量
4. **收尾** — 分支 / 展示 / 写回

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 目标 id | `targetId` / `actionId` | Text |
| 传入参数 | `inputParam`（→ 目标 `quicker_in_param`） | Text |
| 成功 | `delegated` | Boolean |
| 目标输出 | `result` / `output` | Text |

## 示例（trace ✅）

- 目标 `__pattern_learning__run_target`：`showText` `HELLO_DELEGATE`
- 调用方：`runAction` wait → `RUN_OK:__pattern_learning__run_target`

Patch：`.local/patch-run-target.json`、`.local/patch-run-caller.json`

### 最小 patch（调用方）

```json
{
  "stepRunnerKey": "sys:runAction",
  "inputParams": {
    "type": "StartAction",
    "actionId.var": "targetId",
    "inputParam": "",
    "wait": "True",
    "stopIfFail": "True"
  },
  "outputParams": {
    "isSuccess": "delegated",
    "actionTitle": "targetTitle",
    "output": "result"
  }
}
```

## 陷阱

- `step-runner get --control-field StartAction` 过滤输入键。
- `actionId` 用 **GUID** 或**唯一标题**；重名标题会歧义。
- 要读 `output` 必须 **`wait: True`**。
- `inputParam` 写入目标动作的 **`quicker_in_param`** 变量。
- 避免 `StartCurrentAction` 递归；子程序复用用 **`sys:subprogram`**。

## 相关

runAction · subprogram-extract · subprogram · action create
