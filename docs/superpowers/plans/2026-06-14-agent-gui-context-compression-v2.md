# agent-gui 上下文压缩 v2 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent-gui 的上下文压缩从「固定 12 条 + 粗摘要」升级为 **token 预算切分 + microcompact + 结构化摘要**，在接近 context window 时尽量保留有效信息。

**Architecture:** 在 `context-compression-shared.ts` 增加 token 估算与 API round 分组；新增 `context-microcompact.ts` 处理旧 tool 输出瘦身；`prepareCompressedContext` 串联 L1→L2；`/api/chat` 与 dev/tool-test 路由仅调用新 API；metadata 向后兼容扩展。

**Tech Stack:** TypeScript, Node `tsx --test`, Vercel AI SDK (`convertToModelMessages`), Next.js API routes, 现有 `AgentUIMessage` / SQLite 存储不变。

**Spec:** [`../specs/2026-06-14-agent-gui-context-compression-v2-design.md`](../specs/2026-06-14-agent-gui-context-compression-v2-design.md)

**Repo / 目录:** `quicker-rpc/agent-gui/`（非 Quicker 主仓库）

---

## 文件结构（变更地图）

| 文件 | 职责 |
|------|------|
| `lib/context-token-estimate.ts` | **新建** — 单 message / 全线程 token 估算（char/4 + tool 加权） |
| `lib/context-api-rounds.ts` | **新建** — user 锚定的 API round 分组与 round 边界 split |
| `lib/context-microcompact.ts` | **新建** — 旧 round tool output 占位压缩 |
| `lib/context-compression-shared.ts` | **改** — token budget split、触发条件、preview 字段 |
| `lib/context-compression.ts` | **改** — 串联 microcompact + 新 summary prompt + metadata |
| `lib/context-compression.test.ts` | **改** — 新用例 |
| `lib/context-compression.integration.test.ts` | **改** — 端到端 |
| `lib/tool-test-context-compression-scenarios.ts` | **改** — 新场景 `short-thread-heavy-tools` |
| `lib/chat-types.ts` | **改** — metadata 可选字段 |
| `app/api/chat/route.ts` | **改** — 传 `contextLimit` 给 split（已有，确认无回归） |
| `app/api/dev/context-compression/route.ts` | **改** — 返回新 preview 字段 |
| `components/tool-test/ToolTestContextCompressionResultPane.tsx` | **改** — 展示 splitReason |
| `docs/agent-gui-prompt-structure.md` | **改** — 文档 |

---

## Phase 0 — Token 估算与 API Round（基础）

### Task 1: `context-token-estimate.ts`

**Files:**
- Create: `agent-gui/lib/context-token-estimate.ts`
- Test: `agent-gui/lib/context-token-estimate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// agent-gui/lib/context-token-estimate.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  estimateMessageTokens,
  estimateThreadTokens,
} from "@/lib/context-token-estimate";

function user(id: string, text: string): AgentUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("estimateMessageTokens", () => {
  it("counts text by char/4", () => {
    const tokens = estimateMessageTokens(
      user("u1", "a".repeat(400)),
    );
    assert.ok(tokens >= 95 && tokens <= 105);
  });

  it("weights large tool output higher than truncated label", () => {
    const heavy: AgentUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{
        type: "tool-shell_exec",
        toolCallId: "c1",
        state: "output-available",
        input: { command: "echo hi" },
        output: { ok: true, stdout: "x".repeat(20_000) },
      }],
    };
    assert.ok(estimateMessageTokens(heavy) > 3000);
  });
});

describe("estimateThreadTokens", () => {
  it("sums messages", () => {
    const t = estimateThreadTokens([
      user("u1", "hello"),
      user("u2", "world"),
    ]);
    assert.ok(t > 0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```powershell
cd D:\source\repos\quicker\quicker-rpc\agent-gui
pnpm exec tsx --test lib/context-token-estimate.test.ts
```

Expected: module not found / function not defined

- [ ] **Step 3: Minimal implementation**

```typescript
// agent-gui/lib/context-token-estimate.ts
import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

const BASE_MESSAGE_OVERHEAD = 8;

/** Rough token estimate for budgeting (not provider-exact). */
export function estimatePartTokens(
  part: AgentUIMessage["parts"][number],
): number {
  if (isTextUIPart(part)) {
    return Math.ceil(part.text.length / 4);
  }
  if (part.type === "reasoning" && "text" in part) {
    return Math.ceil(String(part.text).length / 4);
  }
  const raw = JSON.stringify(part);
  return Math.ceil(raw.length / 4);
}

export function estimateMessageTokens(message: AgentUIMessage): number {
  let chars = message.role.length + BASE_MESSAGE_OVERHEAD;
  for (const part of message.parts) {
    chars += estimatePartTokens(part) * 4;
  }
  return Math.ceil(chars / 4);
}

export function estimateThreadTokens(messages: AgentUIMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}
```

- [ ] **Step 4: Run test — expect PASS**

```powershell
pnpm exec tsx --test lib/context-token-estimate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add agent-gui/lib/context-token-estimate.ts agent-gui/lib/context-token-estimate.test.ts
git commit -m "feat(agent-gui): add thread token estimation for context budget"
```

---

### Task 2: `context-api-rounds.ts`

**Files:**
- Create: `agent-gui/lib/context-api-rounds.ts`
- Test: `agent-gui/lib/context-api-rounds.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { groupMessagesIntoApiRounds } from "@/lib/context-api-rounds";

describe("groupMessagesIntoApiRounds", () => {
  it("groups user-anchored rounds", () => {
    const messages: AgentUIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "a" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "b" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "c" }] },
    ];
    const rounds = groupMessagesIntoApiRounds(messages);
    assert.equal(rounds.length, 2);
    assert.deepEqual(rounds[0]!.map((m) => m.id), ["u1", "a1"]);
    assert.deepEqual(rounds[1]!.map((m) => m.id), ["u2"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// agent-gui/lib/context-api-rounds.ts
import type { AgentUIMessage } from "@/lib/chat-types";

export type ApiRound = AgentUIMessage[];

/** Split thread into user-anchored rounds for split/microcompact boundaries. */
export function groupMessagesIntoApiRounds(
  messages: AgentUIMessage[],
): ApiRound[] {
  const rounds: ApiRound[] = [];
  let current: ApiRound = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      rounds.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) rounds.push(current);
  return rounds;
}

/** Index in flat messages[] of first message in round N (0-based). */
export function roundStartIndex(
  messages: AgentUIMessage[],
  roundIndex: number,
): number {
  const rounds = groupMessagesIntoApiRounds(messages);
  if (roundIndex <= 0) return 0;
  let idx = 0;
  for (let i = 0; i < roundIndex && i < rounds.length; i += 1) {
    idx += rounds[i]!.length;
  }
  return idx;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent-gui): add API round grouping for context compression"
```

---

## Phase 1 — Token Budget Split（替换固定 12）

### Task 3: 升级 `resolveContextSplitIndex`

**Files:**
- Modify: `agent-gui/lib/context-compression-shared.ts`
- Modify: `agent-gui/lib/context-compression.test.ts`

- [ ] **Step 1: Add failing tests**（在 `context-compression.test.ts` 新增 describe）

```typescript
describe("resolveContextSplitIndex token budget", () => {
  it("returns 0 when entire thread fits recent budget", () => {
    const messages = buildLongThread(6);
    assert.equal(resolveContextSplitIndex(messages, 128_000).splitIndex, 0);
  });

  it("splits heavy short thread when tokens exceed budget", () => {
    const messages: AgentUIMessage[] = [
      userMessage("u1", "goal: sync clipboard"),
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-shell_exec",
          toolCallId: "c1",
          state: "output-available",
          input: { command: "rg foo" },
          output: { ok: true, stdout: "x".repeat(80_000) },
        }],
      },
      userMessage("u2", "continue"),
    ];
    const { splitIndex } = resolveContextSplitIndex(messages, 128_000);
    assert.ok(splitIndex > 0, "heavy short thread should split");
  });
});
```

- [ ] **Step 2: Change return type** — 将 `resolveContextSplitIndex` 改为返回对象：

```typescript
export type ContextSplitResult = {
  splitIndex: number;
  recentTokenEstimate: number;
  splitReason: "none" | "token_budget" | "message_cap";
};

export function resolveContextSplitIndex(
  messages: AgentUIMessage[],
  contextLimit: number,
): ContextSplitResult;
```

实现要点：

```typescript
export const RECENT_BUDGET_RATIO = 0.45;
export const MIN_RECENT_MESSAGES = 4;
export const MAX_RECENT_MESSAGES = 24;

// 从尾部累加 estimateMessageTokens，直到 >= recentBudget 或达到 MAX_RECENT_MESSAGES
// splitIndex = messages.length - recentCount，对齐到 API round 起点（roundStartIndex）
// recentBudget = floor(contextLimit * RECENT_BUDGET_RATIO) - COMPACTION_HEADROOM_TOKENS
```

- [ ] **Step 3: 更新所有调用方**

搜索 `resolveContextSplitIndex(` 并改为 `.splitIndex`：

- `context-compression.ts` — `trigger = split.splitIndex > 0 && ...`
- `previewContextCompression` — 增加 `splitReason`, `recentTokenEstimate`
- `tool-test-context-compression-scenarios.ts` — 断言文案
- `context-compression.integration.test.ts`

- [ ] **Step 4: Run full suite**

```powershell
pnpm test:context-compression
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent-gui): token-budget context split replaces fixed 12 messages"
```

---

### Task 4: 移除 `splitIndex > 12` 硬门槛语义

**Files:**
- Modify: `agent-gui/lib/context-compression.ts` — `trigger` 条件
- Modify: `docs/agent-gui-prompt-structure.md` — 表格改为 token budget 描述

- [ ] **Step 1: 确认 trigger**

```typescript
const split = resolveContextSplitIndex(messages, contextLimit);
const trigger =
  split.splitIndex > 0
  && (force || shouldCompressContextMessages(messages, contextLimit));
```

- [ ] **Step 2: metadata 写入新字段**

```typescript
recentMessagesKept: messages.length - split.splitIndex,
recentTokensEstimate: split.recentTokenEstimate,
splitReason: split.splitReason,
```

- [ ] **Step 3: 更新 `chat-types.ts` ContextCompressionMetadata 可选字段**

- [ ] **Step 4: Run tests + commit**

---

## Phase 2 — Microcompact（L1 层）

### Task 5: `context-microcompact.ts`

**Files:**
- Create: `agent-gui/lib/context-microcompact.ts`
- Test: `agent-gui/lib/context-microcompact.test.ts`

- [ ] **Step 1: Tests** — 旧 round 的 shell stdout 被替换；最近 2 round 不动

- [ ] **Step 2: Implement** — 导出：

```typescript
export type MicrocompactResult = {
  messages: AgentUIMessage[];
  tokensSavedEstimate: number;
  applied: boolean;
};

export function microcompactToolOutputs(
  messages: AgentUIMessage[],
  options: {
    splitIndex: number;
    protectRecentRounds?: number; // default 2
  },
): MicrocompactResult;
```

对每个可 compact 的 tool part，克隆 message 并替换 `output` 为大字段占位 + 保留 `actionId`/`path`/`ok`/`errorMessage` extractor（按 `part.type` switch）。

- [ ] **Step 3: Wire into `prepareCompressedContext`**

```typescript
const split = resolveContextSplitIndex(messages, contextLimit);
const micro = microcompactToolOutputs(messages, { splitIndex: split.splitIndex });
const workingMessages = micro.applied ? micro.messages : messages;
// 用 workingMessages 做 shouldCompress 二次评估（可选优化）
```

- [ ] **Step 4: Run tests + commit**

---

## Phase 3 — 结构化摘要（L2 层）

### Task 6: 升级 summary prompt 与 `summarizePart`

**Files:**
- Modify: `agent-gui/lib/context-compression.ts`

- [ ] **Step 1: 提升常量**

```typescript
const MAX_SUMMARY_OUTPUT_TOKENS = 1800;
const MAX_SUMMARY_SOURCE_CHARS = 24_000;
```

- [ ] **Step 2: 替换 `CONTEXT_COMPRESSION_SYSTEM_PROMPT`** — 要求 5 个 section（见 spec §3.4）

- [ ] **Step 3: 改进 `summarizePart` for tools** — 提取 `actionId`, `path`, `exitCode`, `errorMessage` 而非仅 `state=`

```typescript
if (part.type === "tool-qkrpc_action_create" && part.state === "output-available") {
  const out = part.output as Record<string, unknown> | undefined;
  const data = out?.data as Record<string, unknown> | undefined;
  return `[tool:create] actionId=${data?.actionId ?? "?"} ok=${out?.ok}`;
}
```

- [ ] **Step 4: Integration test** — mock summarize 断言 olderMessages 传入含 actionId 片段

- [ ] **Step 5: Commit**

---

## Phase 4 — 可观测性与 Tool-Test

### Task 7: Dev API + UI

**Files:**
- Modify: `app/api/dev/context-compression/route.ts`
- Modify: `components/tool-test/ToolTestContextCompressionResultPane.tsx`
- Modify: `lib/tool-test-context-compression-scenarios.ts`

- [ ] **Step 1: 新场景 `short-thread-heavy-tools`**

```typescript
{
  id: "short-thread-heavy-tools",
  label: "短线程大 tool（v2 应触发）",
  description: "≤12 条但 token 高；验证 token budget split",
  contextLimit: 128_000,
  simulatedInputTokens: CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K,
  buildMessages: () => [ /* u1, heavy shell, u2 */ ],
}
```

- [ ] **Step 2: Result pane 展示** `splitReason`, `recentTokensEstimate`, `microcompactApplied`

- [ ] **Step 3: 手工验证** — `pwsh ./dev.ps1` → `/tool-test` → 跑 `short-thread-heavy-tools` 与 `reuse-summary`

- [ ] **Step 4: Commit**

---

## Phase 5 — Reactive Compact（可选，本计划末尾）

### Task 8: `/api/chat` 错误重试

**Files:**
- Modify: `app/api/chat/route.ts`
- Test: `agent-gui/lib/context-compression-reactive.test.ts`（mock streamText throw）

- [ ] **Step 1: 检测 message 含 context length / prompt too long**

- [ ] **Step 2: 第二次 `prepareCompressedContext({ force: true })` + 熔断最多 1 次 retry**

- [ ] **Step 3: Commit** — 可单独 PR，不阻塞 Phase 0–4

---

## Phase 6 — 文档与 package.json

### Task 9: 文档

- [ ] 更新 `docs/agent-gui-prompt-structure.md` §3 运行时块、§4 压缩
- [ ] 更新 `docs/agent-gui-chat-storage.md` metadata 新字段
- [ ] 在 spec 文件头 `Status: approved`（人工审核后）

### Task 10: 验证清单（合并前）

```powershell
cd D:\source\repos\quicker\quicker-rpc\agent-gui
pnpm test:context-compression
pnpm exec tsx --test lib/context-token-estimate.test.ts lib/context-api-rounds.test.ts lib/context-microcompact.test.ts
# UI 改动后（若改了 tool-test 组件）:
# dev_frontend_check paths=/,/tool-test
```

---

## 执行顺序与依赖

```text
Task 1 ──┐
Task 2 ──┼──► Task 3 ──► Task 4 ──► Task 5 ──► Task 6 ──► Task 7 ──► Task 9–10
         │
         └── (并行可先做 1+2)
Task 8 独立可选
```

**建议 PR 拆分：**

1. PR1: Task 1–4（token split，行为变化最大）  
2. PR2: Task 5–6（microcompact + summary）  
3. PR3: Task 7–10（UI + docs + reactive）

---

## Spec 覆盖自检

| Spec § | Task |
|--------|------|
| §3.1 常量 | Task 3, 6 |
| §3.2 API round | Task 2, 3, 5 |
| §3.3 microcompact | Task 5 |
| §3.4 摘要 | Task 6 |
| §3.5 触发 | Task 3, 4 |
| §3.6 metadata | Task 4, 6 |
| §5 测试 | 各 Task tests + Task 10 |
| §6 文档 | Task 9 |
| §8 后续 Phase 5–7 | Task 8 + spec §8 |

---

## 执行方式

Plan 已保存至 `docs/superpowers/plans/2026-06-14-agent-gui-context-compression-v2.md`。

**两种执行选项：**

1. **Subagent-Driven（推荐）** — 每个 Task 派生子 agent，Task 间你做 review  
2. **Inline Execution** — 本会话按 Task 顺序直接改代码，Phase 末 checkpoint

你更倾向哪种？确认后我可以从 **Task 1（token 估算）** 开始实现。
