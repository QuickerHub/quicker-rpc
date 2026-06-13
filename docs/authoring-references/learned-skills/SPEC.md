# 学习期场景子 Skill 规范

> **读者**：自主学习写 Quicker 动作的 Agent。  
> **父 skill**：`quicker-authoring`（P0–P7 路由 + 硬规则）。  
> **本层**：按场景拆分的子 skill，**权威源**在 `docs/action-authoring-src/skills/`。

## 1. Skill 架构（单源）

| 层级 | 权威路径 | `docs:gen` 产出 | agent-gui | Cursor（本项目） |
|------|----------|-----------------|-----------|------------------|
| **父** | `action-authoring-src/skills/quicker-authoring/` | `docs/skills/quicker-authoring/` | 预加载 tier-2 | `qkrpc agent setup` |
| **兄弟** | `action-authoring-src/skills/quicker-eval-expression/` | `docs/skills/quicker-eval-expression/` | on-demand | setup |
| **场景子 skill** | `action-authoring-src/skills/quicker-authoring-<slug>/` | `docs/skills/quicker-authoring-<slug>/` | on-demand catalog | 读 `docs/skills/` 或 src |
| **登记册** | `authoring-references/learned-skills/registry.json` | — | 否 | 审核 / 进度索引 |

**禁止**在学习期把场景子 skill 写到 `.cursor/skills/quicker-authoring-*`（避免双源）。  
`.cursor/skills/` 仅保留**仓库贡献者专用** skill（构建、发布、前端检查等）。

agent-gui 扫描 `docs/skills/*`（`agent-gui/lib/agent-skills/paths.ts`）。子 skill 经 `docs:gen` 进入 catalog；**默认 on-demand**，不自动改 `PRELOADED_SKILL_NAMES`。

## 2. 命名

- 目录名 = `manifest.name` = `quicker-authoring-<slug>`（kebab-case）
- `<slug>` 与 `action-patterns/<slug>.md` 或学习任务 id 对齐
- 例外：`quicker-action-library-search`（无 `authoring-` 前缀，动作库专用）

## 3. 何时创建子 skill

Phase 4 pattern 蒸馏 **且** 满足至少一条：

1. 同一类任务重复出现 ≥2 次 retro 卡点，父 skill 路由表未覆盖；
2. pattern 有 **≥3 步** 固定骨架 + 动作级陷阱；
3. benchmark / trace 验证通过，可压缩为 **≤80 行** 可执行指令。

**不创建**：单模块用法、纯链接、无新硬规则 → 只更新 `action-patterns/` 或父 skill Route 表一行。

## 4. 落盘结构（学习 Agent 直接写这里）

```
docs/action-authoring-src/skills/<skillName>/
  manifest.json      # name, description, allowed-tools, compatibility
  SKILL.src.md       # 正文（无 YAML frontmatter；≤120 行）
```

### manifest.json 模板

```json
{
  "name": "quicker-authoring-<slug>",
  "description": "<一句话：何时加载；含中文触发词>",
  "allowed-tools": "docs",
  "compatibility": "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
}
```

### SKILL.src.md 结构

```markdown
# <中文标题>（quicker-authoring-<slug>）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/<slug>.md`

## 何时加载

≤3 行：任务特征；与父 / 兄弟 skill 分工。

## 步骤骨架

有序列表（模块 key + 职责）；不贴完整 data.json。

## 硬规则（本场景）

≤5 条；通用 P0–P7 不重复。

## 变量约定

输入 / 中间 / 输出命名（可选，短表）。

## 陷阱

≤5 行，动作级。

## 深度阅读

- `action-patterns/<slug>.md`
- `step-modules/authored/*.md`
```

**禁止**：猜 `inputParams`；粘贴 workflow 全文；超过 120 行。

## 5. 创建流程（学习 Agent）

1. 完成 `action-patterns/<slug>.md`（或明确 skip）。
2. 创建 `docs/action-authoring-src/skills/<skillName>/manifest.json` + `SKILL.src.md`。
3. 在父 skill `action-authoring-src/skills/quicker-authoring/SKILL.src.md` 的 **Scenario skills** 表增加一行（若新场景）。
4. 登记 `registry.json`：`status: "draft"`，`skillSrcPath`，`verifiedBy`，`sources`。
5. 运行 `npm run docs:gen`（同步 `docs/skills/<skillName>/`；改 src 后必跑）。
6. **不**改 `PRELOADED_SKILL_NAMES`、`prompt-tier0.src.md`（除非用户明确要求 L4 反哺）。

## 6. 审核与状态（registry 门控）

| status | 含义 | src 已存在 | docs:gen |
|--------|------|------------|----------|
| `draft` | 学习产出，待自测 | 是 | 已跑或待跑 |
| `review` | 待人类审核 | 是 | 是 |
| `promoted` | 审核通过，正式维护 | 是 | 是 |
| `rejected` | 不采用 | 可删 src 目录 | 重跑 gen 清理 |

### 审核清单（人类）

- [ ] `manifest.description` 触发词准确，不与兄弟 skill 冲突
- [ ] 无猜键名；经 `step-runner get` 对齐
- [ ] `verifiedBy` 含 trace / benchmark id
- [ ] 体量 ≤80 行可执行内容；长文在 `action-patterns/`

### 审核通过后

1. `registry.json` → `status: "promoted"`，记 `promotedAt`、`reviewedBy`。
2. 确认 `npm run docs:gen` 已执行（`docs/skills/<skillName>/SKILL.md` 最新）。
3. 无需从 `.cursor/skills/` 复制（已废除该路径）。

批量仅更新 registry 状态：`node scripts/promote-learned-skills-from-registry.mjs`（校验 src 存在，不复制文件）。

## 7. registry.json 字段

```jsonc
{
  "slug": "selection-pipeline",
  "skillName": "quicker-authoring-selection-pipeline",
  "status": "draft",
  "patternRef": "docs/authoring-references/action-patterns/selection-pipeline.md",
  "skillSrcPath": "docs/action-authoring-src/skills/quicker-authoring-selection-pipeline/SKILL.src.md",
  "manifestPath": "docs/action-authoring-src/skills/quicker-authoring-selection-pipeline/manifest.json",
  "verifiedBy": ["B01", "trace:..."],
  "sources": ["exemplar:...", "kc:..."],
  "reviewNotes": "",
  "promotedAt": null
}
```

## 8. 与 action-patterns 的分工

| 产物 | 内容 | 消费者 |
|------|------|--------|
| `action-patterns/<slug>.md` | 场景、exemplar、骨架、陷阱 | docs search、审核 |
| `action-authoring-src/skills/...` | 可执行路由 + 硬规则 | `docs:gen` → QuickerAgent / setup |
| `learned-skills/registry.json` | 学习进度与审核状态 | 维护者 |

子 skill 是 pattern 的**可执行摘要**；pattern 是**审核与深度参考**。
