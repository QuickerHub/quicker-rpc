# 公共子程序（Agent 必读）

通过 **`qkrpc subprogram`** 无头管理 Quicker **全局公共子程序**，并在动作步骤中调用。命令细节见 **`qkrpc help --json`**；写动作总流程见 **`authoring-workflow`**。

## 与动作内子程序的区别

| 类型 | 存储 | 管理命令 | 在动作中调用 |
|------|------|----------|--------------|
| **公共子程序** | Quicker 全局库 | `subprogram *` | `sys:subprogram` 步骤 + `callIdentifier` |
| **动作内子程序** | 动作 XAction 的 `subPrograms` 数组 | `action get/patch` 内嵌编辑 | 引用动作内子程序名 |

本文只讲 **公共子程序**。

---

## 流程总览

```text
A. 管理子程序本身
   subprogram search/list → subprogram get → step-runner get → subprogram patch

B. 在动作里调用已有公共子程序
   subprogram search/get → 记下 callIdentifier
   → step-runner get --key sys:subprogram（确认参数键名）
   → action patch 添加 sys:subprogram 步骤
```

---

## 1. 查找子程序

```powershell
qkrpc subprogram search --query "json" --json
qkrpc subprogram list --json
```

响应 `items[]` 含：

| 字段 | 用途 |
|------|------|
| `id` | GUID；用于 `subprogram get/patch --id` |
| `name` | 显示名 |
| **`callIdentifier`** | 写入动作步骤 **`sys:subprogram`** 的 `inputParams.subProgram`；格式通常为 **`%%{subProgramGuid}`**（以 search/get 返回值为准） |

**禁止**凭记忆写 `callIdentifier`；必须从 **`search` / `get`** 响应读取。

---

## 2. 创建子程序

```powershell
qkrpc subprogram create --name "我的子程序" --description "说明" --json
```

返回 `subProgramId`、`callIdentifier`、`editVersion`。之后用 **`subprogram patch`** 添加步骤（语法与 **`action patch`** 相同）。

---

## 3. 读取 / 编辑子程序

```powershell
qkrpc subprogram get --id <id或name> --return-mode structure --json
qkrpc subprogram get --id <id或name> --return-mode full --json
```

| return-mode | 用途 |
|-------------|------|
| `structure` | 步骤树、stepId |
| `full` | 含 `inputParams`（写 patch 前） |
| `metadata` | 名称、步骤概要 |

```powershell
qkrpc subprogram patch --id <id> --patch-file patch.json --expected-edit-version <N> --json
```

patch JSON 形状与 **`authoring-workflow`** / **`patch-workflow`** 中动作 patch **完全相同**（`steps` / `variables` 操作）。

打开 UI 编辑：`qkrpc subprogram edit --id <id>`

修改变量默认值：`qkrpc subprogram edit-var --id <id> --var <key> --value <val> --json`

---

## 4. 在动作中调用公共子程序

### 4.1 必查 StepRunner schema

```powershell
qkrpc step-runner get --key sys:subprogram --json
```

关键输入参数：

| 键名 | 类型 | 说明 |
|------|------|------|
| **`subProgram`** | Text，必填 | 填 **`callIdentifier`**（不是 GUID，除非 identifier 本身就是 id） |
| `skipDebugOutput` | Boolean | 默认 `false` |
| `stopIfFail` | Boolean | 默认 `true` |

输出：`isSuccess`（Boolean）→ 可绑定到变量。

### 4.2 patch 示例：在动作中添加调用步骤

先取得子程序：

```powershell
qkrpc subprogram search --query "jsonpath" --json
# 记下 items[0].callIdentifier
```

patch 片段（空动作首步，或在 `after` 锚点后插入）：

```json
{
  "steps": [{
    "op": "add",
    "index": 0,
    "step": {
      "stepRunnerKey": "sys:subprogram",
      "inputParams": {
        "subProgram": { "value": "%%8e0fdb18-eda3-445a-bd1e-88816c8e841f" }
      },
      "outputParams": {
        "isSuccess": "运行成功"
      }
    }
  }]
}
```

完整保存：

```powershell
qkrpc action patch --id <actionGuid> --patch-file patch.json --expected-edit-version <N> --json
```

### 4.3 硬约束

| # | 约束 |
|---|------|
| 1 | **`callIdentifier` 来自 `subprogram search/get`**（通常 `%%{guid}`），不要猜 |
| 2 | 参数键名 **`subProgram`**（camelCase）来自 **`step-runner get`**，不是 `subProgramId` |
| 3 | 子程序 patch 与动作 patch 共用 **`step-runner get`** 规则 |
| 4 | patch 成功后以响应为准，勿仅为验证再 `subprogram get` |

---

## 5. 删除

```powershell
qkrpc subprogram delete --id <idOrName> --yes --json
```

若子程序仍被动作引用，Quicker 可能拒绝删除。

---

## 相关主题

`authoring-workflow` · `patch-workflow` · `step-modules` · `step-runner-search` · `variables` · `xaction-json`
