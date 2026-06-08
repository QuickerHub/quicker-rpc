/** Preset actions for /tool-test trace streaming UI. */

import {
  ephemeralXActionTabId,
  TRACE_REPEAT_DEMO_XACTION,
  TRACE_SMOKE_XACTION,
  type InlineXActionProgram,
} from "@/lib/action-trace-inline-programs";

export type ActionTraceTestCase = {
  id: string;
  label: string;
  description: string;
  /** Synthetic tab id when using inline xaction (no Quicker action). */
  actionId: string;
  actionTitle?: string;
  param?: string;
  /** Inline program JSON — preferred for standalone demos. */
  xaction?: InlineXActionProgram;
  /** No run param, clipboard, or external files required. */
  standalone?: boolean;
};

/** One-click trace demos (Quicker + qkrpc serve only; no saved action). */
export const ACTION_TRACE_STANDALONE_CASES: ActionTraceTestCase[] = [
  {
    id: "trace-smoke",
    label: "Smoke（3 步）",
    description:
      "_trace_smoke：表达式 + 赋值，数秒内完成，验证 trace 格式（内联 JSON，无需创建动作）",
    actionId: ephemeralXActionTabId("trace-smoke"),
    actionTitle: TRACE_SMOKE_XACTION.title,
    xaction: TRACE_SMOKE_XACTION,
    standalone: true,
  },
  {
    id: "repeat-demo",
    label: "60 次循环（长流）",
    description:
      "_trace_repeat_demo：repeat × 60，repeatDelayMs=120（约 7s+ 流式），验证 trace 时间线/终端逐行输出（内联 JSON）",
    actionId: ephemeralXActionTabId("repeat-demo"),
    actionTitle: TRACE_REPEAT_DEMO_XACTION.title,
    xaction: TRACE_REPEAT_DEMO_XACTION,
    standalone: true,
  },
];

/** Presets that need files, params, or other setup before trace. */
export const ACTION_TRACE_SETUP_CASES: ActionTraceTestCase[] = [
  {
    id: "wordfreq",
    label: "词频（需文件 path）",
    description: "文件词频：变量 path 需指向可读文本；可在「自定义」填 param 或先改动作默认 path",
    actionId: "88bbe636-bbfe-410a-9709-1dbcf1d3aef6",
    actionTitle: "文件词频统计",
    standalone: false,
  },
];

export const ACTION_TRACE_TEST_CASES: ActionTraceTestCase[] = [
  ...ACTION_TRACE_STANDALONE_CASES,
  ...ACTION_TRACE_SETUP_CASES,
];

export function getDefaultActionTraceTestCase(): ActionTraceTestCase {
  return ACTION_TRACE_STANDALONE_CASES[0]!;
}
