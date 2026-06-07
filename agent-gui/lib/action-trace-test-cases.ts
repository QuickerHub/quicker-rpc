/** Preset actions for /tool-test trace streaming UI. */

export type ActionTraceTestCase = {
  id: string;
  label: string;
  description: string;
  actionId: string;
  actionTitle?: string;
  param?: string;
  /** No run param, clipboard, or external files required. */
  standalone?: boolean;
};

/** One-click trace demos (Quicker + qkrpc serve only). */
export const ACTION_TRACE_STANDALONE_CASES: ActionTraceTestCase[] = [
  {
    id: "trace-smoke",
    label: "Smoke（3 步）",
    description: "_trace_smoke：表达式 + 赋值，数秒内完成，验证 trace 格式",
    actionId: "40c77070-227c-4604-847c-40750a12403f",
    actionTitle: "_trace_smoke",
    standalone: true,
  },
  {
    id: "repeat-demo",
    label: "60 次循环（长流）",
    description:
      "_trace_repeat_demo：repeat × 60，repeatDelayMs=120（约 7s+ 流式），验证 trace 时间线/终端逐行输出",
    actionId: "b1742f26-0b19-4e41-9540-ed83b5998b81",
    actionTitle: "_trace_repeat_demo",
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
