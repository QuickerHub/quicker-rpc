# QuickerAgent 愿景 — 头脑风暴整理与执行主计划

> **For agentic workers:** 本文件是 `todo` 头脑风暴的**总路由**；具体子系统另有独立 spec/plan，实施时先读对应链接再动手。  
> **日期:** 2026-06-16 · **状态:** active

**Goal:** 把「长在 Quicker 旁边的 AI 副驾」从**能写动作**演进到**能找、能学、能自动化、能调试、能自主改进**，最终通向 Quicker Studio。

**Architecture:** 五条能力链并行、有依赖顺序——**知识链**（文档/模块/动作库）→ **编写链**（authoring + 注释 + benchmark）→ **浏览器链**（Playwright/embedded → 录制成动作）→ **运行链**（trace/debug/mock/runtime）→ **进化链**（compile-verify loop 自治改编译器）。远期 **独立 Runtime** 承接 P4 Studio。

**与 [ROADMAP.md](../../ROADMAP.md) 关系:** ROADMAP 按产品阶段（P0–P5）；本计划按**能力域**切分，并标注映射到 ROADMAP 的哪一段。

---

## 0. 现状快照（头脑风暴 vs 仓库）

| 想法（todo） | 状态 | 已有资产 |
|--------------|------|----------|
| embedded 浏览器脚本 | ✅ 已落地 | [browser-automation 设计](../specs/2026-06-14-browser-automation-design.md) |
| 模块 L1 学习 143/143 | ✅ 已完成 | [step-module-learning](./2026-06-13-step-module-learning.md) |
| 编译验证 loop | 🟡 设计+脚本 | [compile-verify-loop 设计](../specs/2026-06-14-actionruntime-compile-verify-loop-design.md)、`scripts/compile-verify-loop/` |
| 动作库学习 / 蒸馏 | 🟡 计划进行中 | [action-authoring-learning](./2026-06-13-quicker-action-authoring-learning.md) |
| 强制步骤注释 | 🟡 skill 有，未强制 | `quicker-authoring-step-comments` |
| 找动作 / 答使用问题 | 🟡 部分能力 | benchmark L0、`action-authoring-docs-search`、library search 设计 |
| 浏览器 → Quicker 动作 | ❌ 缺口 | **本计划 Wave 1 核心** |
| 配置 trigger | ❌ 未产品化 | ROADMAP P2、`trigger-workflow` topic |
| 变量重命名评测 | 🟡 有任务 | benchmark `meta-rename-only` |
| debug 前激活窗口 | ❌ 未规格化 | `qkrpc_action_debug` 已有，缺环境前置协议 |
| inputParam 任意 JSON | 🟡 文档有，提示词冲突 | `schema-hot-action-steps.md` vs 旧 prompt 表述 |
| 脱离 Quicker 独立 runtime + 断点 | 🔵 远期 | ROADMAP P4、ActionRuntime 项目 |
| 模块 schema 挂 docId 可检索 | ❌ 未做 | docs search 按 topic，非 per-module docId |
| 完整制作流程录屏 | ❌ 未做 | — |
| 分析文档结构优化设计 | 🟡 维护脚本 | `docs:modules:analyze` / `docs:gen` |
| 自主性（Agent 改编译器） | 🟡 原型 | `Start-AgentLoop.ps1` |

---

## 1. 能力域分解

```text
                    ┌─────────────────────────────────────┐
                    │  Wave 1: 杀手 Demo（浏览器→动作）      │
                    └─────────────────┬───────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     ▼                                ▼                                ▼
┌─────────────┐              ┌─────────────────┐              ┌──────────────────┐
│ A 知识链     │              │ B 编写链         │              │ C 浏览器链        │
│ 找/学/答     │──────────────│ patch/注释/评测  │──────────────│ Playwright/embedded│
└──────┬──────┘              └────────┬────────┘              └────────┬─────────┘
       │                              │                                  │
       └──────────────────────────────┼──────────────────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │ D 运行链: trace / debug / mock / runtime │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │ E 进化链: compile-verify Agent loop   │
                    └─────────────────┬───────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │ F 远期: 独立 Runtime + Studio + 断点   │
                    └─────────────────────────────────────┘
```

---

## 2. 执行波次（建议顺序）

### Wave 0 — 不阻塞主线的收尾（1–2 周，与 ROADMAP P0 并行）

与 [ROADMAP 建议下一步](../../ROADMAP.md#建议下一步24-周) 对齐：

- [ ] P0：启动器 + 语音闭环
- [ ] Benchmark 接 `/tool-test` E2E + trace 半自动打分（ROADMAP P1）
- [ ] **提示词一致性：** 统一 `inputParam` 可为 JSON 标量/对象/数组的表述（`prompt-tier0` + `instructions.ts` + `errors-table`），消除「只能字符串」类冲突
- [ ] **步骤注释纳入流程：** `authoring-workflow` P5 后检查 ≥3 步动作是否有 `sys:comment`；benchmark 加 1 条「带注释的多步动作」验收

**验收:** `pnpm test:docs-search:eval` 不降分；authoring benchmark 新增项可手评通过。

---

### Wave 1 — 杀手 Demo：浏览器自动化 → Quicker 动作（2–4 周）⭐

> todo 标注「打通这个链条，那岂不是无敌了」— **最高优先级产品验证**。

**用户故事:** 用户对 Agent 说「打开某站、登录、点按钮、把结果存剪贴板」→ Agent 用 `browser` 工具完成 → **自动生成** 等价 Quicker 动作（chromecontrol / http / 表达式步骤）→ 用户一键保存并在 Quicker 里重放。

| 子任务 | 交付物 | 依赖 |
|--------|--------|------|
| 1.1 录制协议 | [2026-06-16-browser-to-action-design.md](../specs/2026-06-16-browser-to-action-design.md) | ✅ |
| 1.2 步骤生成器 MVP | `agent-gui/lib/browser-to-action/` + `browser_to_action` tool | 🟡 MVP |
| 1.3 人工确认 UI | workbench 侧栏「导入为动作」：预览 structure + patch | workspace_program |
| 1.4 Demo 脚本 | 固定 1 条 benchmark：`browser-scrape-to-action`（httpbin 或静态页） | mock 可选 |
| 1.5 Trigger 衔接（薄） | 生成动作后，Launcher intent「为此动作添加热键」链到 `trigger-workflow` 只读引导 | ROADMAP P2 预研 |

**非目标（Wave 1）:** 全自动 trigger 写入、复杂登录态跨会话、完整录屏。

**验收:** 从自然语言到「可 `action_debug` 通过」的动作，全程 Agent 单线程完成；demo 可录屏对外展示。

---

### Wave 2 — Agent 核心能力补强（4–6 周，ROADMAP P1）

| 域 | 子任务 | 交付物 |
|----|--------|--------|
| **找动作** | 2.1 统一检索入口 | Agent 工具层：`action_query`（本地 list/search + library search 同一话术）；补全 [getquicker-library-search DESIGN](../../authoring-references/getquicker-library-search/DESIGN.md) 未上线 CLI |
| **答使用问题** | 2.2 问答路由 | `docs_get` + `action-authoring-docs-search` 合并策略写入 `quicker-authoring`；Launcher「怎么用 Quicker 做 X」走 docs 优先 |
| **学动作库** | 2.3 续跑 L2 pattern | 按 [action-authoring-learning](./2026-06-13-quicker-action-authoring-learning.md) Phase 3–4：每 tick 2–3 pattern → `action-patterns/*.md` |
| **编辑能力** | 2.4 变量重命名 E2E | benchmark `meta-rename-only` 接 `/tool-test` 自动断言；扩展 `workspace_program` rename 变量跨步骤 |
| **调试** | 2.5 debug 环境协议 | spec：`debuginfo` — 需前台窗口/剪贴板/选中文本时，先 `activateProcess` / 用户确认步骤；`qkrpc_action_debug` 文档化前置条件 |
| **知识检索** | 2.6 module→docId（可选） | `step-runner get` 响应或 `_catalog` 增加 `kcDocId` / `referenceTopic`；`docs search` 支持 `module:sys:http` 过滤 |

**验收:** authoring benchmark L0+L2 主干 ≥70%；`discover-library-search` 与 `meta-rename-only` E2E 绿。

---

### Wave 3 — 质量与自治（6–10 周，ROADMAP P1 质量 + P3 浏览器深化）

| 子任务 | 说明 |
|--------|------|
| 3.1 compile-verify loop 常态化 | `Pull-Cases` 本机 50 例 + getquicker 10 例；每周 `Get-LoopStatus`；blocked 模式驱动 ActionRuntime 缺口 |
| 3.2 Agent 修编译器环 | `Start-AgentLoop.ps1` + 文档化「pin 单 case → 改 Runtime → `-t` → retry」；与 todo「自主性」对齐 |
| 3.3 mock profile 扩展 | 为 Wave 1 browser 生成动作补 mock profile |
| 3.4 制作流程录屏（探索） | 仅内部：Agent 步骤 + OBS/Playwright trace 存档，不做产品化 |
| 3.5 Subagent 蒸馏 | 专用 readonly subagent：读 KC + action get → 输出 pattern 草稿，人审后落盘 |

**验收:** compile-verify 队列 `mock_pass` 率周环比上升；至少 3 个 unsupported step 被 loop 驱动修掉。

---

### Wave 4 — 触发与自动化（ROADMAP P2）

- [ ] Action trigger 数据直接 patch（经 Quicker API / 专用 RPC）
- [ ] web-monitor → trigger → action 一键继承
- [ ] Wave 1 生成的动作可「一键加 trigger」

**前置:** Wave 1 动作生成稳定 + `trigger-workflow` 实跑验证。

---

### Wave 5 — 平台化（ROADMAP P3→P4）

| 里程碑 | 内容 |
|--------|------|
| P3 | WebView 快速 UI、前端预览、AI 发布审核 |
| P4a | ActionRuntime 覆盖主路径步骤；`runtime-check` 与 Quicker trace 对齐 |
| P4b | **精细化编译** + mock 调试（todo：编译优化后断点） |
| P4c | 独立执行引擎 + 授权 |
| P4d | Quicker Studio（编辑器 + 脚本一等公民 + 调试 + 发布） |

**依赖链:** P3 转脚本 → P4 脚本引擎 → 独立执行 → Studio（与 ROADMAP 一致）。

---

## 3. 子计划索引（实施时跳转）

| 主题 | 文档 |
|------|------|
| 模块微观学习 | [2026-06-13-step-module-learning.md](./2026-06-13-step-module-learning.md) |
| 动作库 / pattern 学习 | [2026-06-13-quicker-action-authoring-learning.md](./2026-06-13-quicker-action-authoring-learning.md) |
| 浏览器统一 | [2026-06-14-browser-automation-unification.md](./2026-06-14-browser-automation-unification.md) |
| 编译验证 loop | [2026-06-14-actionruntime-compile-verify-loop-design.md](../specs/2026-06-14-actionruntime-compile-verify-loop-design.md) |
| ActionRuntime 迁移 | [2026-06-11-actionruntime-v2-migration.md](./2026-06-11-actionruntime-v2-migration.md) |
| Authoring benchmark | [agent-authoring-benchmark.md](../../agent-authoring-benchmark.md) |
| 步骤注释 skill | `docs/skills/quicker-authoring-step-comments/SKILL.md` |

**待新建 spec（Wave 1 阻塞）:**

- `docs/superpowers/specs/2026-06-16-browser-to-action-design.md` ✅
- `docs/superpowers/specs/2026-06-16-action-debug-environment-design.md`（Wave 2.5）

---

## 4. 四周冲刺 Backlog（可立刻开工）

按优先级排序，每条 ≤3 天：

1. **写 browser-to-action 设计 spec**（1d）— 映射表 + 非目标 + 验收 demo
2. **修 inputParam JSON 提示词冲突**（0.5d）— `prompt-tier0.src.md`、`instructions.ts`
3. **benchmark E2E 接线** `meta-rename-only` + `discover-library-search`（1–2d）
4. **续跑 action-patterns** 首批 3 个：clipboard-pipeline、http-json-extract、window-branch（各 1 tick）
5. **compile-verify** `Pull-Cases -Limit 20` + 周报模板（0.5d）
6. **authoring-workflow 强制 comment 检查项**（0.5d）

---

## 5. 风险与原则

| 风险 | 缓解 |
|------|------|
| 范围爆炸（Studio/runtime/浏览器/学习全做） | 本计划 Wave 门控；Wave 1 未 demo 不启动 P4 |
| 动作库爬取合规 | 只读 search + shared get；不批量镜像（learning 计划已写） |
| Agent 猜 inputParams | 硬规则保留：search → get；schema-hot 写清 JSON value |
| 调试环境不可复现 | debug 协议写清前置；benchmark 标注环境假设 |
| 提示词与文档双源 | 变更走 `docs:gen` + tier0 单源 |

**YAGNI:** 录屏、docId 检索、断点调试 — 有明确 Wave，不提前实现。

---

## 6. `todo` 文件迁移建议

`todo` 根目录可改为指向本文件 + ROADMAP，避免双源：

```markdown
# 已迁移

- 总计划: docs/superpowers/plans/2026-06-16-agent-vision-master-plan.md
- 产品阶段: docs/ROADMAP.md
```

---

## 7. 执行方式选择

完成子 spec 评审后：

1. **Subagent-Driven** — 每个 Wave 子任务独立 subagent + 任务间 review（推荐 compile-verify、pattern 学习）
2. **Inline** — Wave 0/1 产品 demo 在本会话连续推进

请告知优先启动 **Wave 0 收尾** 还是 **Wave 1 browser-to-action spec**。
