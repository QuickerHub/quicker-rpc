# QuickerBench — Agent 任务完成度评测

> **Status:** draft · **Date:** 2026-06-19  
> **动机：** 现有 [动作编写 Benchmark](agent-authoring-benchmark.md) 侧重 **流程与 rubric**（选型、patch 规范、trace 合规）；QuickerBench 侧重 **任务是否完成、输出是否正确**，用 **参考实现 + 确定性 oracle** 判定 pass/fail。

---

## 1. 与现有评测的关系

| 维度 | Authoring Benchmark | QuickerBench |
|------|---------------------|--------------|
| 问什么 | Agent 会不会 **正确编写** Quicker 动作 | Agent 能不能 **交付可运行且结果正确** 的动作 |
| 评分 | 六轴 A–F + 人工/LLM Judge | **oracle 断言** 为主（mock run `--assert`） |
| Prompt | 自然语言，禁写工具名 | 同上 |
| 参考物 | rubric `must` / `mustNot` | **oracle 脚本** + mock `outputVars`（不强制参考动作） |
| 入口 | `pnpm agent-eval` + `authoring-tasks.json` | `pnpm agent-eval --preset quickerbench` + `quickerbench-tasks.json` |

两者可交叉引用同一 mock profile（如 `http-json-origin`），但 **QuickerBench 通过线只看 mock assert 与 oracle 脚本算出的期望值**。

---

## 2. 评测链路

```text
用户 prompt（自然语言）
        │
        ▼
   Agent 会话（/api/chat 或 SDK）
        │ 产出：工作区动作 id + 步骤
        ▼
   QuickerBench Runner
        ├─ 1. compile/runtime-check（动作可编译）
        ├─ 2. mock run + assert（对照 oracle.outputVars）
        └─ 3. optional: oracle 脚本自检 fixture ↔ tasks.json 是否一致
        │
        ▼
   pass | fail + diff（outputVars、步数、unsupportedStepKeys）
```

**硬规则（与 authoring 相同）：**

- 评测 prompt **不得**出现 `qkrpc_*`、`workspace_program` 等工具名。
- 验证阶段 **必须** mock（禁 nightly 直连 getquicker 生产站）。
- **不强制**参考 Quicker 动作；期望值由 **oracle 脚本**（如 `.mjs`）从 fixture 或 live 页计算，写入 `quickerbench-tasks.json` + mock profile。

### 2.1 I/O 契约（子程序式，禁止 UI 交互）

QuickerBench **不评测** 消息框、文本窗口、表单、选文件、托盘提示等 **人机交互**；一律按 **子程序** 设计：

```text
动作参数 / initialVars  ──►  步骤（HTTP / 表达式 / 分支 / …）  ──►  输出变量（IsOutput）
         ▲ mock profile 注入                                           ▲ mock --assert 断言
```

| 允许 | 禁止（作为输入/输出/主路径） |
|------|------------------------------|
| 动作 **输入参数**（`Default` 目录） | `sys:msgbox`、`sys:textwindow` |
| **输出变量**（`IsOutput=true`） | `sys:form`、表单步骤 |
| mock `initialVars` 注入参数 | `sys:selectfile`、选目录 |
| mock `mocks.http` / `mocks.window` 等 **替身数据** | 以 notify / toast **作为通过条件** |
| 读剪贴板 **仅当** 任务未定义参数且 legacy profile 需要 | 以「写回剪贴板」代替输出变量 |

**Agent prompt 写法：** 明确列出输入参数名、输出变量名与含义；**不要**写「弹窗展示」「让用户选择文件」等话术。

**Oracle 脚本（推荐）：** 独立 `.mjs` / `.cs` 实现与任务相同的输入→输出逻辑；维护 fixture 时用 `--live` 拉页，CI 用 fixture 目录 `--sync` 更新 `outputVars`。Agent **不需要**复刻某分享动作。

**验证命令：**

```powershell
qkrpc action run --id <guid> --mock --mock-profile <id> --assert --json
# mock profile 用 initialVars 注入输入；assertions.outputVars 断言输出
```

---

## 3. 目录与文件

```text
agent-gui/benchmarks/
  quickerbench-tasks.json          # 任务 catalog（本文件为设计源）
  quickerbench-tasks.schema.json   # JSON Schema（待补）
  quickerbench-fixtures/
    getquicker-user-actions/
      113342-cea/                  # 5 页 HTML 快照 + manifest.json
  mock-profiles/
    user-action-likes-total.json   # HTTP mock → 上述 fixture
    …

agent-gui/lib/quickerbench/        # catalog loader、eval preset
scripts/quickerbench/
  lib/user-actions-likes.mjs       # 解析 + 聚合（fixture / live）
  oracle-user-action-likes-total.mjs
scripts/
  quickerbench-fetch-fixtures.mjs  # 拉取 HTML → fixture
  quickerbench-sync-oracle.mjs     # 调用 oracle --sync
  test-user-actions-likes.mjs      # live 探针（维护者）
```

---

## 4. 任务 Schema（草案）

```typescript
type QuickerBenchTask = {
  id: string;
  tier: "Q1" | "Q2" | "Q3";       // Q1 单能力 · Q2 多步 · Q3 外部集成
  category: string;
  label: string;
  userPrompt: string;              // 只给用户看的话术（须描述 IO，禁 UI）
  /** 子程序式输入输出契约（评测硬约束） */
  ioContract: {
    inputs: Array<{ key: string; type: "string" | "number"; required?: boolean }>;
    outputs: Array<{ key: string; type: "string" | "number" | "bool" }>;
    forbiddenStepKeys?: string[];  // 默认含 msgbox / textwindow / form / selectfile
  };
  /** Agent 产出动作的约束（可选） */
  deliverable?: {
    titlePattern?: string;         // 如 _quickerbench_*
    minSteps?: number;
    requiredStepKeys?: string[];   // 如 sys:httprequest
  };
  /** 已有金标准动作（可选；不推荐，优先 oracle.script） */
  reference?: {
    sharedActionId?: string;
    localHint?: string;
  };
  /** mock profile 的 initialVars（与 ioContract.inputs 对齐） */
  runInput?: {
    initialVars?: Record<string, string | number>;
  };
  /** 确定性期望（CI 使用 fixture，数值固定） */
  oracle: {
    /** Repo-relative oracle script, e.g. scripts/quickerbench/oracle-*.mjs */
    script?: string;
    fixtureSet?: string;
    outputVars?: Record<string, string | number | boolean>;
    /** 数值容差；默认 0 */
    tolerance?: Record<string, number>;
    /** 快照元数据（说明 oracle 来源，非断言字段） */
    snapshot?: { capturedAt?: string; note?: string };
  };
  verify: {
    mockProfile: string;
    modes?: Array<"mock-oracle" | "compile-only">;
  };
  skills: string[];
};
```

**Pass 定义（默认）：**

1. `qkrpc action run --id <agentActionId> --mock --mock-profile <id> --assert` → `assertions.passed === true`
2. `oracle.outputVars` 与 `node scripts/quickerbench/oracle-*.mjs`（fixture 模式）输出一致
3. `unsupportedStepKeys` 为空（ActionRuntime 可执行）

---

## 5. 首批 5 个任务

### Q3-1 · `user-action-likes-total`（旗舰）

**I/O：**

| 运行输入 | 输出变量 |
|----------|----------|
| `{quicker_in_param}` — getquicker 用户分享页 URL | `totalLikes` — 获赞合计 · `actionCount` — 动作个数 |

**用户 prompt：**

> 做一个 Quicker 动作，不要弹窗或文本窗口。运行时用 `{quicker_in_param}` 接收 getquicker 用户分享页链接（完整 URL 或 `User/Actions/…` 路径）。抓取该用户全部公开动作（含分页），把获赞总数写入输出变量 `totalLikes`，动作个数写入 `actionCount`。

Agent 只负责写动作；mock assert 在运行后检查 context 输出变量，无需在 prompt 里要求 Agent 自验。

**Oracle 脚本：**

| 命令 | 说明 |
|------|------|
| `node scripts/quickerbench/oracle-user-action-likes-total.mjs` | 从 fixture 计算（默认） |
| `node …/oracle-user-action-likes-total.mjs --live` | live 页实时结果（维护者） |
| `node …/oracle-user-action-likes-total.mjs --sync` | 写回 `quickerbench-tasks.json` |

**Oracle（fixture `113342-cea`）：**

| outputVar | 期望值 |
|-----------|--------|
| `totalLikes` | `9270` |
| `actionCount` | `117` |

> 由 `scripts/quickerbench/lib/user-actions-likes.mjs` 对 fixture 解析；live 对照用 `--live`。
> 注意：页面「获赞」列中 `<10` 在 HTML 里无具体数字，参考实现与探针脚本均按 **0** 计（与 live 合计一致）。

**考查能力：** HTTP 请求、分页 loop、HTML 表格解析、变量聚合、输出变量赋值。

**mock profile：** `user-action-likes-total` — mock `https://getquicker.net/User/Actions/113342-Cea` 及 `?p=2…5` 返回 fixture 文件。

---

### Q1-2 · `http-json-origin`

**I/O：** 输入 `url`（默认 `https://httpbin.org/get`）→ 输出 `origin`（字符串）。

**用户 prompt：**

> 做一个子程序式动作：输入参数 `url`，GET 请求该 URL，从 JSON 响应取出 `origin` 写入输出变量 `origin`。不要弹窗。

**参考：** 与 authoring `http-json-origin` 同场景；mock profile 用 `initialVars.url` + `outputVars.origin`。

**Oracle：** `outputVars.origin = "203.0.113.1"`（mock 固定）。

**考查能力：** HTTP + JSON 字段提取（基线校准任务）。

---

### Q2-3 · `csv-text-sum`

**I/O：** 输入 `csvText` → 输出 `rowCount`、`amountSum`、`result`（格式 `行数,合计`）；无 `amount` 列时 `ok=False` 且 `errorMessage` 说明原因。

**用户 prompt：**

> 做一个子程序式动作：输入参数 `csvText`（CSV 文本，首行表头）。统计数据行数，对 `amount` 列求和；输出 `rowCount`、`amountSum` 和 `result`（形如 `3,35`）。若缺少 amount 列，设输出 `ok=False` 并写 `errorMessage`，不要用弹窗。

**mock profile：** `csv-text-sum`（`initialVars.csvText`，断言 `outputVars`）。

**Oracle：** `ok=True`，`result=3,35`，`rowCount=3`，`amountSum=35`。

**考查能力：** CSV 解析、列名匹配、分支错误处理、多输出变量。

---

### Q2-4 · `json-format-text`

**I/O：** 输入 `text` → 输出 `ok`、`formatted`（合法 JSON 时 2 空格缩进）；非法 JSON 时 `ok=False`，`errorMessage` 非空。

**用户 prompt：**

> 做一个子程序式动作：输入参数 `text`。若是合法 JSON 则 `ok=True` 并将 2 空格缩进结果写入输出变量 `formatted`；否则 `ok=False` 并在 `errorMessage` 说明。不要读写剪贴板，不要弹窗。

**mock profile：** `json-format-text` / `json-format-text-invalid`。

**Oracle（合法）：** `ok=True`，`formatted` 含缩进 JSON。

**考查能力：** JSON 校验、格式化、分支、纯变量输出。

---

### Q2-5 · `title-branch-io`

**I/O：** 输入 `title`（窗口标题字符串）→ 输出 `isVscode`（bool）、`branch`（`maximize` | `skip`）。

**用户 prompt：**

> 做一个子程序式动作：输入参数 `title`。若包含 `Visual Studio Code` 则 `isVscode=True` 且 `branch=maximize`，否则 `isVscode=False` 且 `branch=skip`。不要读取真实前台窗口，不要最大化窗口或弹窗提示。

**mock profile：** `title-branch-io` / `title-branch-io-not-vscode`（仅 `initialVars.title`）。

**Oracle：** vscode 样例 → `isVscode=True`，`branch=maximize`；Notepad 样例 → `isVscode=False`，`branch=skip`。

**考查能力：** if/else 分支、布尔与枚举输出（替代原 window UI 任务）。

---

## 6. Fixture 策略（`user-action-likes-total`）

1. **采集：** `curl`/脚本拉取 `113342-Cea` 的 `p=1…5` HTML 存入 `quickerbench-fixtures/getquicker-user-actions/113342-cea/page-{n}.html`。
2. **manifest.json：** 记录 `totalActions`、`pages`、`totalLikes`、`parsedCount`、采集时间。
3. **mock profile：** `mocks.http` 按 URL 精确匹配返回对应 page 文件内容。
4. **刷新 oracle：** `node scripts/quickerbench/oracle-user-action-likes-total.mjs --sync`（或 `quickerbench-sync-oracle.mjs`）

**禁止** 在 PR CI 中访问 getquicker 生产站；live 脚本仅用于维护 fixture。

---

## 7. Runner 集成（待实现）

| 阶段 | 内容 |
|------|------|
| P0 | `quickerbench-tasks.json` + fixture + `user-action-likes-total` mock profile |
| P1 | `lib/quickerbench/` loader；`agent-eval` 增加 `--preset quickerbench` / `Q1_CORE` |
| P2 | `/tool-test` 面板「QuickerBench」tab：选任务 → 跑 agent → 一键 assert |
| P3 | reference-run parity；与 compile-verify-loop 同步 benchmark 动作 id |

**CLI 示例（目标形态）：**

```powershell
# Oracle 自检（fixture → JSON）
node scripts/quickerbench/oracle-user-action-likes-total.mjs

# 维护者：live 对照 + 可选刷新 fixture
node scripts/quickerbench-fetch-fixtures.mjs
node scripts/quickerbench/oracle-user-action-likes-total.mjs --sync

# Agent 产出动作 mock 断言
qkrpc action run --id <guid> --mock --mock-profile user-action-likes-total --assert --json
```

---

## 8. 后续可扩展任务（>5）

| id | 说明 |
|----|------|
| `user-action-top3-likes` | 同页面解析，输出获赞 Top3 动作名（JSON 数组） |
| `getquicker-library-search` | 动作库关键词搜索 + 结果条数（mock HTML） |
| `file-copy-path-io` | 输入 `sourcePath`/`destDir`，输出 `destPath`（filesystem mock，无选文件 UI） |
| `multi-var-assign` | 单步多变量表达式（校准 Agent 表达式能力） |
| `subprogram-quickerpc-run` | 调用公共子程序 QuickerRpc_Run |

---

## 9. 维护清单

- [x] 提交 `quickerbench-tasks.json` 与 `113342-cea` fixture
- [x] 实现 `user-action-likes-total.json` mock profile（`contentFile` → fixture HTML）
- [x] oracle 脚本 `scripts/quickerbench/oracle-user-action-likes-total.mjs`（fixture + `--live` + `--sync`）
- [x] `agent-eval` preset `quickerbench-core`（5 条）
- [x] 文档交叉链接：`agent-gui-eval.md`

---

## 10. 参考

- [agent-authoring-benchmark.md](agent-authoring-benchmark.md)
- [agent-gui-eval.md](agent-gui-eval.md)
- [mock verify 设计](superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md)
- 探针 / oracle：[`scripts/quickerbench/oracle-user-action-likes-total.mjs`](../scripts/quickerbench/oracle-user-action-likes-total.mjs)
- 示例页快照：[`uploads/113342-Cea-0.md`](../uploads/113342-Cea-0.md)（仅 page 1，完整评测需 5 页 fixture）
