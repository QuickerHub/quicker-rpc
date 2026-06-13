# 学习期写动作子 Skill 规范（draft tier）

> **读者**：自主学习写 Quicker 动作的 Agent。  
> **父 skill**：`quicker-authoring`（P0–P7 路由 + 硬规则，agent-gui 预加载）。  
> **本层**：按场景拆分的**子 skill**，学习期自用，**不**进入 agent-gui bundled skills，直至人类审核晋升。

## 1. 三层 Skill 架构

| 层级 | 路径 | agent-gui | Cursor Agent | 谁维护 |
|------|------|-----------|--------------|--------|
| **父** | `docs/skills/quicker-authoring/` | 预加载 tier-2 | 是 | 仓库正式版 |
| **兄弟** | `docs/skills/quicker-eval-expression/` 等 | on-demand 目录 | 是 | 仓库正式版 |
| **学习子 skill（draft）** | `.cursor/skills/quicker-authoring-<slug>/` | **否** | 是（项目 skill 自动发现） | 学习 Agent |
| **登记册** | `docs/authoring-references/learned-skills/registry.json` | 否 | 路由索引 | 学习 Agent |

agent-gui 只扫描 `docs/skills/*`（见 `agent-gui/lib/agent-skills/paths.ts`）。**禁止**在学习期把子 skill 直接写入 `docs/skills/` 或改 `PRELOADED_SKILL_NAMES`。

## 2. 命名

- 目录与 `name`：`quicker-authoring-<slug>`
- `<slug>` 与 `action-patterns/<slug>.md` 或学习任务 id 对齐（kebab-case）
- 示例：`quicker-authoring-selection-pipeline`、`quicker-authoring-http-json-api`

## 3. 何时创建子 skill（判定）

在 Phase 4 pattern 蒸馏 **且** 满足至少一条时创建 draft skill：

1. 同一类任务重复出现 ≥2 次 retro 卡点，且父 skill 路由表未覆盖；
2. pattern 有 **≥3 步** 固定骨架 + 动作级陷阱（非单模块 authored 能表达）；
3. benchmark 实写验证通过，知识可压缩为 **≤80 行** 可执行指令。

**不创建**（只更新 `action-patterns/` 或在父 skill 加 1 行路由）：单模块用法、纯文档链接、无新硬规则。

## 4. SKILL.md 结构（子 skill 固定顺序）

```markdown
---
name: quicker-authoring-<slug>
description: "<一句话：何时加载本 skill；含中文触发词>"
parent: quicker-authoring
status: draft
learned-from: "<pattern slug | benchmark id | exemplar action id>"
---

# <中文标题>（quicker-authoring-<slug>）

> **父 skill**：quicker-authoring · **状态**：draft · **深度参考**：`docs/authoring-references/action-patterns/<slug>.md`

## 何时加载

≤3 行：任务特征；与父 skill / 其他子 skill 的分工。

## 步骤骨架

有序列表（模块 key + 职责）；**不**贴完整 data.json。

## 硬规则（本场景）

仅本场景额外约束（≤5 条）；通用规则不重复（仍服从父 skill P0–P7）。

## 变量约定

输入 / 中间 / 输出命名。

## 陷阱

≤5 行，动作级。

## 深度阅读

- `action-patterns/<slug>.md`
- `step-modules/authored/*.md`（列出用到的 id）
- `docs get` topics（workflow 名）
```

**禁止**：猜 `inputParams`；粘贴 `authoring-workflow` 全文；超过 120 行（路由 skill 上限，与 `generate-authoring-docs.mjs` 一致）。

## 5. 创建流程（学习 Agent）

1. 完成 pattern 文档 `action-patterns/<slug>.md`（或明确 skip）。
2. 写 `.cursor/skills/quicker-authoring-<slug>/SKILL.md`。
3. 更新 `registry.json` 条目：`status: "draft"`，`sources`、`verifiedBy`（benchmark / trace id）。
4. **不**改 `docs/skills/`、`PRELOADED_SKILL_NAMES`、`prompt-tier0.src.md`（除非用户明确要求 L4 反哺）。

## 6. 人类审核与晋升（promotion）

审核入口：`registry.json` 中 `status: "review"` 的条目 + 对应 `.cursor/skills/` diff。

### 审核清单（人类）

- [ ] description 触发词准确，不会与 `quicker-eval-expression` 等兄弟 skill 冲突
- [ ] 无猜键名；示例经 `step-runner get` 对齐
- [ ] 实跑证据（trace / benchmark id）在 `verifiedBy`
- [ ] 体量 ≤80 行可执行内容；长文已在 `action-patterns/`

### 晋升步骤（审核通过后由 Agent / 维护者执行）

1. `registry.json` → `status: "promoted"`，记 `promotedAt`、`reviewedBy`。
2. 复制为正式源：`docs/action-authoring-src/skills/<skillName>/SKILL.src.md` + `manifest.json`（或 `node scripts/promote-learned-skills-from-registry.mjs` 批量）。
3. 在 `docs/action-authoring-src/skills/quicker-authoring/SKILL.src.md` 的 Route 表增加一行指向子 skill。
4. `scripts/generate-authoring-docs.mjs` 自动扫描 `action-authoring-src/skills/*`（除 parent / eval-expression）→ `docs/skills/<name>/`。
5. `npm run docs:gen` → 产出 `docs/skills/<skillName>/SKILL.md`。
6. 默认 **on-demand**（加入 skill catalog）；仅当需要会话开局加载时才改 `PRELOADED_SKILL_NAMES`（需人类决定）。
7. 可选：删除 `.cursor/skills/` 副本（晋升后建议删除 draft 副本，避免双源）。

## 7. registry.json 字段

```jsonc
{
  "slug": "selection-pipeline",
  "skillName": "quicker-authoring-selection-pipeline",
  "status": "draft",           // draft | review | promoted | rejected
  "patternRef": "action-patterns/selection-pipeline.md",
  "skillPath": ".cursor/skills/quicker-authoring-selection-pipeline/SKILL.md",
  "verifiedBy": ["B01", "trace:..."],
  "sources": ["exemplar:...", "kc:..."],
  "reviewNotes": "",
  "promotedAt": null
}
```

## 8. 与 action-patterns 的分工

| 产物 | 内容 | 消费者 |
|------|------|--------|
| `action-patterns/<slug>.md` | 场景、exemplar、骨架、陷阱（人类可读） | docs search、审核 |
| `learned-skills` 子 skill | 可执行路由 + 硬规则（Agent 指令） | Cursor 学习期自动加载 |
| 晋升后 `docs/skills/...` | 与 draft 同构，经 docs:gen | QuickerAgent on-demand |

子 skill 是 pattern 的**可执行摘要**；pattern 是**审核与深度参考**。
