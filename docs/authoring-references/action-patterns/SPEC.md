# action-patterns 手写 reference 规范

> **读者**：维护 `docs/authoring-references/action-patterns/<slug>.md` 的 Agent。  
> **前提**：单模块细节在 `step-modules/authored/`；本目录只描述**多步组合**与**任务级写法**。

## 1. 与 step-modules authored 的分工

| 层级 | 目录 | 回答 |
|------|------|------|
| 模块 | `step-modules/authored/<id>.md` | 这一步怎么配参数 |
| 模式 | `action-patterns/<slug>.md` | 这类任务步骤怎么串、变量怎么命名 |

若 pattern 仅重复一个模块的 authored 内容 → **skip**，在 progress 记 reason。

## 2. 命名

- `<slug>`：kebab-case 英文，如 `http-json-api`
- 进度 id 与文件名一致

## 3. 结构

```markdown
# <中文标题>

> **场景**：… · **难度**：S/M/L · **exemplar**：[动作名](sharedId 或 local id)

## 何时用

≤3 行：任务特征，与相近 pattern 的差异。

## 步骤骨架

有序列表（模块 key + 职责），非完整 patch。

## 变量约定

输入/中间/输出变量命名建议。

## 示例动作

链接 1–2 个标杆；可选最小 `__pattern_learning__` 片段（≤25 行 JSON）。

## 陷阱

≤5 行：仅动作级（非单模块）问题。

## 相关

authored refs · workflow topics · 其他 pattern
```

维护流程见 [`../learning-workflow.md`](../learning-workflow.md)。

## 4. 信息源

1. `qkrpc action get --return-mode full`（exemplar 解构）
2. 动作库 / KC 内 sharedaction 链接（发现 exemplar）
3. `step-runner get`（写示例片段时键名权威）
4. 实跑 `action run --trace`（验证骨架可行）

## 5. 禁止

- 猜 inputParams（必须先 get）
- 复制他人动作全文进仓库（只链 sharedId + 自写最小示例）
- 把 authoring-workflow 全文粘贴进 pattern 文件
