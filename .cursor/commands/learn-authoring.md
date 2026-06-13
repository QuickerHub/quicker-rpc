# learn-authoring — 动作级学习（pattern / 动作库 / skill）

按 [动作编写学习总计划](../../docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md) 执行**一轮**动作级学习。对话结束**立即执行**，勿等待用户。

## 0. 连通与进度

1. `qkrpc_health`；失败则 `qkrpc_wait`（禁止 shell 连环 ping）。
2. 读 `docs/authoring-references/action-patterns/.learning-progress.json`。
3. `node scripts/action-authoring-learning-progress.mjs --next` 取本批任务。
   - 输出 `ALL_DONE` → 汇报进度与 backlog 建议，结束。
   - 否则按输出的 `type` 执行下方协议。

## 1. 任务类型协议

### `library-exemplar` — 动作库解构（只读）

1. `qkrpc action library search` 或 `npm run search:library`（勿直接爬 HTML）。
2. 选 2–3 个 sharedId → `qkrpc action shared get`（**禁止 patch**）。
3. 记录：步骤链、变量表、表达式 vs 模块 vs csscript 比例。
4. 写 `docs/authoring-references/benchmarks/retro/YYYY-MM-DD-library-exemplar-roundN.md`。
5. 若有泛化价值且非单模块重复 → 走 `pattern-distill`；否则仅 retro。
6. `--mark-done <queue-id>`。

### `pattern-distill` — 新模式 P1–P6

1. P1：2–3 exemplar `action get full`。
2. P2–P4：写 `docs/authoring-references/action-patterns/<slug>.md`（见 SPEC）。
3. P5：新建 `__pattern_learning__*` 动作 → patch → **mock assert**（有 profile）或 trace。
4. P6：`action-authoring-src/skills/quicker-authoring-<slug>/` + `registry.json` draft → `npm run docs:gen`。
5. `--mark-done <queue-id>`；更新 `.learning-progress.json` patterns。

### `skill-promote` — draft → promoted

1. 读 `registry.json` 与对应 pattern；确认 mock/trace 证据。
2. 补全 `SKILL.src.md`；`npm run docs:gen`。
3. 人类门控：`status: "promoted"` + `reviewedBy`（本命令可标 `review` 待审）。
4. `--mark-done <queue-id>`。

### `pattern-enrich` — 已有 pattern 补 exemplar

1. 读已有 `action-patterns/<slug>.md` + 新 sharedId 解构。
2. 增补 exemplar 表与陷阱；**不**复制他人 csscript 主逻辑。
3. 必要时 `__pattern_learning__*` 验证 → mock assert。
4. `--mark-done <queue-id>`。

### `sdk-benchmark` — 回归单条 authoring-task

1. 告知用户可用 headless：`/cursor-sdk` + `-VerifyMock`（本命令在 IDE 内则用 MCP 等价流程）。
2. 对 `taskIds` 中每条：按 `agent-gui/benchmarks/authoring-tasks.json` 的 `userPrompt` 实写。
3. 有 `verify.mockProfile` → `qkrpc_action_run(mode=mock, assert=true)`。
4. 写简短 retro 行；`--mark-done <queue-id>`。

## 2. 硬规则

- `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — **禁止**猜 `inputParams`
- 程序体：`extract` → 改 `data.json`/`files/` → `workspace_program` patch — **禁止**内联 steps patch
- patch 后信任 `editVersion` — **禁止** patch 后再 full get
- 动作库 / shared：**只读**；写作仅 `__pattern_learning__*` / `__bench_*`，用后删除
- 有 mock profile 的任务：**mock assert 通过**后才可 mark-done / 晋升 skill
- 步骤自描述：新动作加 `sys:comment` 分段（见 `step-comments` pattern）

## 3. 批末

- 更新 `.learning-progress.json`（`updatedAt`、patterns、retro 链接）
- 每完成 3 个 pattern：检查 prompt-tier0 / 父 skill 路由（Phase 6）
- 产出变更涉及 src skill 时：`npm run docs:gen`

## 4. 持续 loop

用户要求后台续跑时：先本命令跑一轮，再 `pwsh scripts/run-action-learning-loop.ps1`。
