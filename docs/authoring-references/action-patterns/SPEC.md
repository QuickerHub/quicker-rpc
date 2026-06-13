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

见 [`docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md`](../../superpowers/plans/2026-06-13-quicker-action-authoring-learning.md) §6。

## 4. 信息源

1. `qkrpc action get --return-mode full`（exemplar 解构）
2. 动作库 / KC 内 sharedaction 链接（发现 exemplar）
3. `step-runner get`（写示例片段时键名权威）
4. 实跑 `action run --trace`（验证骨架可行）

## 5. 禁止

- 猜 inputParams（必须先 get）
- 复制他人动作全文进仓库（只链 sharedId + 自写最小示例）
- 把 authoring-workflow 全文粘贴进 pattern 文件
