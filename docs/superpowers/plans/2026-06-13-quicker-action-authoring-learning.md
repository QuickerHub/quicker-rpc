# Quicker 动作编写 — Agent 自主学习总计划

> **For agentic workers:** 先读本计划 → 按 Phase 顺序推进 → 每轮产出落盘 → 批末更新 skills / prompt-tier0。  
> **与 step-module 学习的关系:** 模块级（微观）已基本完成；本计划补**动作级（中观）**与**技能/提示词（宏观）**两层。

**Goal:** Agent 能**自主**从官方文档、动作库、他人动作、实写验证中蒸馏知识，稳定写出可运行的 Quicker 组合动作，并持续改进 `quicker-authoring` skill、基础 system prompt、step-module references。

**Non-goals（本计划不做）:** 替代 Quicker 官方文档全文；爬取并镜像整个动作库；未授权复制他人闭源动作对外发布。

---

## 1. 学习体系分层

```text
L4  Retrofit     优化 prompt-tier0、初始 skills、AGENTS 路由表
L3  Practice     按 benchmark 实写动作 → trace 验证 → 复盘
L2  Patterns     从动作库/本地动作蒸馏「写法模式」→ action-patterns/
L1  Modules      step-runner get + KC → authored/<id>.md     [≈已完成 143/143]
L0  Foundation   官方概念：变量、流程、表达式、子程序、编辑器
Meta Skill       学会写/改 SKILL.md（create-skill 规范 + 本仓库 SPEC）
```

| 层 | 回答的问题 | 主要产出 |
|----|------------|----------|
| L0 | Quicker 动作是什么、怎么在编辑器里搭 | `foundation/*.md` 摘要（链到 KC） |
| L1 | 单个步骤模块怎么配参数 | `authored/<id>.md`（已有 SPEC） |
| L2 | 多步怎么组织、常见任务怎么拆 | `action-patterns/<slug>.md` |
| L3 | 我能不能从零写出来 | `benchmarks/` 临时动作 + `retro/<date>-*.md` |
| L4 | Agent 默认提示缺什么 | 经审核晋升的 skill → `docs/skills/`；父 skill 路由表 |
| Meta | 怎么把学到的东西固化成子 skill | draft：`.cursor/skills/quicker-authoring-*` + `learned-skills/registry.json` |

---

## 2. 信息源优先级（降噪）

| 优先级 | 来源 | 用途 | 禁止 |
|--------|------|------|------|
| 1 | `qkrpc step-runner get` | 参数键名、controlField、purpose | 猜 inputParams |
| 2 | `qkrpc action get --return-mode full` | 本地/已安装动作的真实结构 | 未 get 就臆造步骤 |
| 3 | 仓库 `authored/` + `docs get` workflow topics | 写步骤流程 P0–P7 | 把 workflow 全文贴进 skill |
| 4 | KC 爬取稿 `kc/<id>.md` + [KC Help](https://getquicker.net/KC/Help/Doc/) | 场景、分支语义、示例动作链接 | 整段复述 get 已有字段 |
| 5 | [动作库](https://getquicker.net/share) + sharedAction 页 / `action get`（library 过滤） | 找标杆动作、看说明与标签 | 批量爬全站 |
| 6 | [QuickerModuleDoc](https://github.com/PassWordE/QuickerModuleDoc) | JSON 示例、社区写法 | 当 schema 权威 |
| 7 | WebSearch / WebFetch | 仅当 4–6 缺页或概念不明 | 代替实跑验证 |

**官方推荐学习路径**（KC [how-to-learn](https://www.getquicker.net/KC/Help/Doc/how-to-learn)）纳入 L0 验收清单：变量 → 基础模块 → 插值/表达式 → 按需查模块文档 → 复杂特性。

---

## 3. Phase 定义（做什么）

### Phase 0 — 基线盘点（1 tick）

- [ ] 读 `overview` + `authoring-workflow`（`docs get`）
- [ ] 确认 qkrpc 连通（`qkrpc_health` / `qkrpc_wait`）
- [ ] 统计 L1 进度：`.learning-progress.json`（当前 **143 模块 done/skipped**）
- [ ] 建立 L2 进度文件：`docs/authoring-references/action-patterns/.learning-progress.json`
- [ ] 列出首批 **10 个 pattern 候选**（见 §5.2）

**产出:** 进度 JSON 初始化 + 本 Phase checklist 全勾。

### Phase 1 — 概念地基 L0（1–2 tick）

精读并各写 **≤1 页** 摘要（中文，链到 KC，不复制全文）：

| 主题 | KC / 仓库 topic |
|------|-----------------|
| 组合动作原理、变量传递 | how-to-learn, xaction-editor |
| 表达式与 `$=` | expressions + **quicker-eval-expression** skill |
| 子程序 | subprogram-workflow |
| 动作数据 schema | action-data-schema |
| 无头编辑流程 | authoring-workflow P0–P7 |

**产出:** `docs/authoring-references/foundation/*.md`（可选，仅当 docs search 不够用）。

### Phase 2 — 模块微观 L1（维护态）

协议见 [`2026-06-13-step-module-learning.md`](./2026-06-13-step-module-learning.md)（P1–P5）。

- 状态：**143/143 已 done/skipped** → 仅在新 step-runner 上线或 schema 变更时增量学习。
- 批末三连：`docs:modules:analyze` → `docs:modules:gen` → `docs:gen`。

### Phase 3 — 动作库侦察 L2-A（每 tick 2–3 个 pattern 候选）

1. **发现（公开库）:** `qkrpc action library search` → `qkrpc action shared get`（只读，**禁止 patch**）；设计见 [`getquicker-library-search/DESIGN.md`](../../authoring-references/getquicker-library-search/DESIGN.md)。CLI 未上线前开发探针：`npm run search:library`（Agent 不得直接解析 HTML）。
2. **发现（本机）:** `qkrpc action list --query '{"filter":{"source":"library"},"keyword":"<领域>"}' --json`
2. **选型:** 选「步骤数适中、无 UI 交互、可本地安装或已有 sharedId」的标杆。
3. **解构:** `action get full` → 记录：变量表、步骤链、子程序调用、表达式 vs 模块 vs csscript 比例。
4. **不写盘** 直到 Phase 4 判定有泛化价值。

### Phase 4 — 模式蒸馏 L2-B（单模式协议 P1–P6）

对每个 **pattern**（不是单个模块）：

| 步 | 动作 |
|----|------|
| P1 | 收集 2–3 个 exemplar（动作库 + 本地），`action get full` |
| P2 | 抽象：输入/输出、步骤骨架、必用模块、常见分支（if/loop/subprogram） |
| P3 | 对照 SPEC：若只是单模块用法 → **skip**，指向 `authored/<id>.md` |
| P4 | 写 `action-patterns/<slug>.md`（见 §6） |
| P5 | **实写验证:** 按 pattern 新建 `__pattern_learning__*` 动作，patch，`action run --trace`，删临时动作 |
| P6 | `learning-progress --mark-done <slug>` |

### Phase 5 — 刻意练习 L3（benchmark 轮）

维护 `docs/authoring-references/benchmarks/manifest.json`：

| id | 任务描述 | 验收 |
|----|----------|------|
| B01 | 选中文本 → 变换 → 写回 | trace 输出变量正确 |
| B02 | HTTP GET JSON → 提取字段 | 用 http + jsonExtract 或表达式 |
| B03 | 循环列表 + 条件 break | loop + simpleIf/break |
| B04 | 抽子程序复用 | global subprogram + call |
| B05 | 文件批处理 | getSelectedFiles + readFile + WriteTextFile |

每完成一项 → `retro/YYYY-MM-DD-Bxx.md`：**预期 / 实际 / 卡点 / 应对 / 是否需改 skill**。

### Phase 6 — 反哺 L4（每完成 3 个 pattern 或 5 个 benchmark）

**默认只产出 draft 子 skill，不直接改 agent-gui bundled skills。**

1. 汇总 retro 中的重复卡点。
2. 对达标 pattern **创建或更新** draft 子 skill（见 §10）。
3. 将待审核条目标为 `registry.json` → `status: "review"`，写 **`learning-retro/YYYY-MM-DD-l4-summary.md`**（含晋升建议清单）。
4. **仅当用户审核通过**：执行 promotion（§10.3）→ `docs/action-authoring-src/skills/` → `docs:gen`。
5. 可选：用户授权后改 **`prompt-tier0.src.md`**（父 skill 热路由 +1 行，不堆全文）。

### Meta — 学会写子 Skill（贯穿 L2–L4）

每次要固化知识时：

1. 读 `create-skill` + [`learned-skills/SPEC.md`](../../authoring-references/learned-skills/SPEC.md)。
2. 先写 `action-patterns/<slug>.md`，再写 **draft 子 skill**（可执行摘要）。
3. Draft 落盘：`.cursor/skills/quicker-authoring-<slug>/SKILL.md` + 登记 `registry.json`（`status: draft`）。
4. **禁止**学习期写入 `docs/skills/` 或改 `PRELOADED_SKILL_NAMES`。
5. 晋升（人类审核后）：`action-authoring-src/skills/` → `npm run docs:gen` → agent-gui on-demand catalog。

---

## 4. 学习了过后的产出（交付物清单）

| 交付物 | 路径 | 消费者 |
|--------|------|--------|
| 模块 reference | `step-modules/authored/<id>.md` | `step_runner_get.docReference` |
| 动作写法模式 | `action-patterns/<slug>.md` | 新 skill + docs search |
| 概念摘要 | `foundation/*.md`（可选） | L0 速查 |
| 练习 manifest | `benchmarks/manifest.json` | L3 回归 |
| 单次复盘 | `benchmarks/retro/*.md` | L4 输入 |
| L4 汇总 | `learning-retro/*-l4-summary.md` | 人类 review |
| 进度 | `.learning-progress.json` ×2 | loop 脚本 |
| Draft 子 skill | `.cursor/skills/quicker-authoring-<slug>/SKILL.md` | Cursor 学习 Agent（**非** agent-gui） |
| 子 skill 登记册 | `learned-skills/registry.json` | 审核 / 晋升追踪 |
| 晋升后 skill | `docs/skills/quicker-authoring-<slug>/` | QuickerAgent on-demand（审核后） |
| 优化补丁 | `prompt-tier0.src.md`（可选） | QuickerAgent 父 skill 热路由 |

**「学完」的判定（Definition of Done）:**

- L1: 全部 step-runner **done 或 skipped（有 reason）** — **已达成**。
- L2: pattern 清单中 **≥80%** `done` 或 `skipped`。
- L3: benchmark manifest **100%** 至少跑通一次 trace。
- L4: 至少 **1 轮** l4-summary + **≥1 个** draft 子 skill 进入 `review`；晋升到 `docs/skills/` 需人类审核（不纳入自主 DoD）。

---

## 5. 首批 Pattern 候选（L2 backlog）

按 Quicker 官方学习路径 + 动作库高频场景：

| slug | 场景 | 典型模块链 |
|------|------|------------|
| selection-pipeline | 选中 → 处理 → 写回 | getSelectedText, stringProcess, sendKeys/sendText |
| clipboard-pipeline | 剪贴板读写 | getClipboardText, writeClipboard |
| http-json-api | REST 调用 | http, jsonExtract, assign |
| file-batch | 多文件处理 | getSelectedFiles, loop, readFile, WriteTextFile |
| loop-control | 循环+中断 | loop, simpleIf, break, continue |
| subprogram-extract | 逻辑抽取复用 | 子程序 + runAction/call |
| expression-first | 能用表达式不用模块 | evalexpression, assign |
| path-and-exists | 路径检查分支 | checkPathExists, if |
| delay-retry | 等待重试 | delay, loop, simpleIf |
| ui-automation-lite | 前台窗口/按键 | activateProcessMainWindow, keyInput |

进度文件初始化时写入上述 slug，`status: pending`。

---

## 6. action-patterns 文档规范（草案）

路径：`docs/authoring-references/action-patterns/<slug>.md`

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

链接 1–2 个标杆；可选最小 `__pattern_learning__` patch 片段（≤25 行 JSON）。

## 陷阱

≤5 行：仅动作级（非单模块）问题。

## 相关

authored refs · workflow topics · 其他 pattern
```

---

## 7. 写动作子 Skill 三层（draft → 审核 → agent-gui）

```text
quicker-authoring（父，agent-gui 预加载）
├── quicker-eval-expression（兄弟，已正式 on-demand）
├── quicker-authoring-selection-pipeline（子，学习期 draft）
├── quicker-authoring-http-json-api（子，学习期 draft）
└── …
```

| 阶段 | 位置 | agent-gui 可见 |
|------|------|----------------|
| **学习 draft** | `.cursor/skills/quicker-authoring-<slug>/SKILL.md` | 否 |
| **登记** | `docs/authoring-references/learned-skills/registry.json` | 否 |
| **深度参考** | `docs/authoring-references/action-patterns/<slug>.md` | 经 docs search |
| **审核** | 人类看 registry `review` + git diff | — |
| **晋升** | `docs/action-authoring-src/skills/` → `docs/skills/` | 是（on-demand） |

规范全文：[`learned-skills/SPEC.md`](../../authoring-references/learned-skills/SPEC.md)。

### 7.1 创建时机（Phase 4 末尾）

pattern `mark-done` 且 benchmark/trace 通过后，按 SPEC §3 判定是否建子 skill；建则同步更新 `registry.json`。

### 7.2 学习 Agent 自检

- [ ] `parent: quicker-authoring` 元信息或正文首行声明
- [ ] `status: draft` in frontmatter
- [ ] 未触碰 `docs/skills/`、`agent-gui/lib/agent-skills/paths.ts`
- [ ] 路由表不重复父 skill P0–P7 / 硬规则

### 7.3 用户审核后晋升（promotion）

1. `registry.json` → `promoted` + `reviewedBy`
2. `SKILL.src.md` + `manifest.json` 进入 `action-authoring-src/skills/`
3. 父 skill Route 表 +1 行；`generate-authoring-docs.mjs` 注册
4. `npm run docs:gen`；默认 **不** 加入 `PRELOADED_SKILL_NAMES`

---

## 8. Subagent / Loop 约定

与 step-module loop 对齐：

```text
续跑 action-pattern learning:
读 docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md
与 docs/authoring-references/action-patterns/.learning-progress.json
--next 取 2 个 pending pattern → 执行 §4 Phase 4 P1–P6
临时动作仅 __pattern_learning__* / __benchmark__*，用后即删
批末: 新 action-patterns md；新 draft 子 skill 只写 .cursor/skills + registry
每 3 pattern 触发 Phase 6；docs:gen 仅晋升后或改 action-authoring-src 时
```

脚本占位（可后续实现）：`scripts/init-action-pattern-learning-progress.mjs`、`scripts/run-action-learning-loop.ps1`。

---

## 9. 优化建议的输出格式（Phase 6 模板）

每次 L4 汇总必须回答：

1. **缺口:** Agent 在哪类任务上仍猜参数/漏步骤？
2. **根因:** 缺 reference / 缺 workflow 路由 / prompt 未强调？
3. **改动:** draft 子 skill / pattern /（仅审核后）正式 skill 路径 + 理由。
4. **验证:** 重跑哪个 benchmark / trace；registry 状态变更。
5. **不做:** 未经审核改 `docs/skills/`、`PRELOADED_SKILL_NAMES`。

---

## 10. 立即开始（Phase 0 → Phase 1 入口）

用户确认本计划后，Agent **不要等待**，按序执行：

1. Phase 0 checklist（连通性 + 初始化 `action-patterns/.learning-progress.json`）。
2. Phase 1：`docs get` overview + authoring-workflow + expressions 摘要（mental model）。
3. Phase 3+4：从 backlog 取 **selection-pipeline**、**http-json-api** 两个 pattern 做首轮蒸馏。

**停止条件:** 用户喊停；或 L2+L3 DoD 达成且 L4 至少一轮完成。
