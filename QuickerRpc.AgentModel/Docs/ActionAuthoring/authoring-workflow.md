# qkrpc 写动作流程（Agent 必读）

通过 **`qkrpc.exe`** 无头编辑当前 Quicker 配置里的 XAction。命令细节见 **`qkrpc help --json`**；本文只规定**顺序与硬约束**。

## 前置

```powershell
qkrpc ping --json
```

Quicker 已启动且已加载 QuickerRpc 插件。编辑对象仅限**当前动作页**中的动作（无 `action create`，新动作请在 Quicker UI 创建）。

---

## 流程总览

```text
1. action list / action search     → 得到 actionId (GUID)
2. action get                      → editVersion + 现有程序（读模型）
3. implementation-fallback         → 决定用表达式还是专用步骤（先读指南）
4. 每个专用步骤：
     step-modules（有则跳过搜索）
  → step-runner search（无表项时，一次 OR/通配符查询）
  → step-runner get（必须，拿 inputParams 键名与类型）
5. expressions（若参数值用 $= / $$）
6. action patch（一次调用 = 一次保存）
7. 以 patch 响应为准，禁止仅为验证再 action get
```

---

## 1. 定位动作

```powershell
qkrpc action list --query "动作名" --json
# 或
qkrpc action search --query "关键词" --json
```

记下 **`actionId`**（GUID）。

---

## 2. 读取现有程序

```powershell
qkrpc action get --id <guid> --return-mode structure --json   # 扫步骤树、stepId
qkrpc action get --id <guid> --return-mode full --json        # 写 patch 前需要非默认参数值时
```

| return-mode | 用途 |
|-------------|------|
| `structure` | 只有 `stepRunnerKey`、`stepId`、分支，**无** `inputParams` |
| `full` | 含 `inputParams`，但**省略**与目录默认相同的空字面量 |
| `metadata` | 标题、步骤概要，不写 patch 时用 |

响应中的 **`editVersion`** 用于下次 patch 的 `--expected-edit-version`（冲突时重读再试或 `--force`）。

读模型字段说明：**`xaction-json`**。

---

## 3. 选型（先读，再加步骤）

```powershell
qkrpc guide get --topic implementation-fallback --json
```

- 计算、比较、赋值 → 优先 **`expressions`** / `sys:evalexpression`，不要堆无关模块步骤。
- 需要 UI/IO 能力 → 再走下面的 **StepRunner 目录**。
- 搜不到模块 → 按 **`implementation-fallback`** 回退（脚本等），**禁止**猜 Quicker 内部 API 名。

---

## 4. 搜索步骤模块（StepRunner）

### 4.1 速查表（优先）

```powershell
qkrpc guide get --topic step-modules --json
```

表里的 `stepRunnerKey` 可直接用于下一步 **`step-runner get`**。

### 4.2 目录搜索（表里没有时）

```powershell
qkrpc step-runner search --query "剪贴板|clipboard|sys:*clip*" --json
```

语法见 **`step-runner-search`**（空格 AND、`|` OR、`*` 通配符）。**一次调用**传齐同义词，不要拆成多次瞎搜。

从 `items[].key` 选定 **`stepRunnerKey`**。

### 4.3 获取 schema（每个新建/修改的步骤都必须）

```powershell
qkrpc step-runner get --key sys:MsgBox --json
```

响应 `payload.schema` 包含：

| 字段 | 用途 |
|------|------|
| `StepRunnerKey` | 写入 patch 的 `stepRunnerKey` |
| `Inputs[].Key` | **`inputParams` 的键名**（如 MsgBox 是 `message`，不是 `content`） |
| `Inputs[].ValueType` / `Required` / `Default` | 类型与是否必填 |
| `Inputs[].Options` | 枚举可选值 |
| `ControlField` | 子操作（如 `operation` = default/custom）时，先设控制字段再设其它参数 |
| `Outputs[].Key` | 输出绑定时的 output 名 |

**禁止**在未执行 `step-runner get` 的情况下凭记忆或其它动作的参数名写 `inputParams`。

---

## 5. 写入：patch JSON 语法

一次保存 = 一次 CLI 调用：

```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

### 5.1 顶层形状

```json
{
  "steps": [ /* 步骤操作 */ ],
  "variables": [ /* 可选，变量操作 */ ]
}
```

### 5.2 步骤 `inputParams`（与 schema 对齐）

每个参数键来自 **`step-runner get`** 的 `Inputs[].Key`。

**只写需要的键**（降低 token、避免噪音）：

| 场景 | 写什么 |
|------|--------|
| **`add` 新步骤** | 必填且实际要设值的参数 + **控制字段**（`ControlField` / `IsControlField`，即使等于 Default 也写）+ 与目录 **`Default` 不同** 的普通可选参数 |
| **`update` 改步骤** | 仅要改的键；换 `stepRunnerKey` 时用 `null` 删掉旧模块的参数键 |

对照 `step-runner get` → `schema.Inputs[].Default`：**等于默认值的普通参数省略**；**控制字段一般不省略**（见 **`patch-workflow`**「Omit catalog defaults」）。

```json
"inputParams": {
  "message": { "value": "显示文字" },
  "someVar": { "varKey": "变量key" }
}
```

| 写法 | 含义 |
|------|------|
| 键省略 | `update`：不修改该参数；`add`：使用目录默认值 |
| `{ "value": "..." }` | 字面量 |
| `{ "varKey": "..." }` | 引用变量 |
| `null` | 删除该参数键 |

### 5.3 常见步骤操作

| op | 要点 |
|----|------|
| `add` | 需 `index` 或 `after`/`before` 锚点；新步骤要带 `stepRunnerKey` + `inputParams` |
| `update` | `id` 为 `s-1` 等 **stepId**（来自上次 `action get` 或 patch 响应的 `addedSteps`） |
| `remove` | `id` |
| `move` | 见 **`patch-workflow`** |

空动作首步示例：

```json
{
  "steps": [{
    "op": "add",
    "index": 0,
    "step": {
      "stepRunnerKey": "sys:MsgBox",
      "inputParams": {
        "message": { "value": "hello" }
      }
    }
  }]
}
```

变量、子程序、完整替换：**`patch-workflow`**、**`variables`**、**`action replace`**。

---

## 6. 保存后

patch 成功时响应含 **`editVersion`**、**`addedSteps`**、**`updatedSteps`** 等：

- 下一步 patch 用新的 `editVersion`。
- 新插入步骤的 **`stepId`** 从 **`addedSteps`** 取，**不要**仅为确认再 `action get`。

版本冲突 → 重新 `action get` 取 `editVersion` 后重试。

---

## 硬约束（违反会导致写错或保存失败）

| # | 约束 |
|---|------|
| 1 | 每个新建/改参步骤：**先 `step-runner get`，再写 `inputParams` 键名** |
| 2 | 专用步骤：**先 `implementation-fallback` / `step-modules`，再 `step-runner search`** |
| 3 | patch 只含要改的字段；**普通** `inputParams` 省略与目录 `Default` 相同的键；**控制字段一般不省略**（**`patch-workflow`**） |
| 4 | 成功后**不以 `action get` 代替 patch 响应**做验证 |
| 5 | 变量写入用数字 **`type`**；读取可能是 **`varType` 字符串**（**`variables`**） |
| 6 | 表达式语法见 **`expressions`** |

## 相关主题

`overview` · `cli-setup` · `step-modules` · `step-runner-search` · `xaction-json` · `patch-workflow` · `variables` · `expressions` · `implementation-fallback`
