/** Inline XAction programs for /tool-test trace (no Quicker action required). */

export type InlineXActionProgram = {
  title: string;
  steps: unknown[];
  variables: unknown[];
};

export const TRACE_SMOKE_XACTION: InlineXActionProgram = {
  title: "_trace_smoke",
  steps: [
    {
      stepRunnerKey: "sys:evalexpression",
      inputParams: {
        expression: {
          value: '$="trace smoke " + DateTime.Now.ToString("HH:mm:ss")',
        },
      },
      outputParams: {
        result: "msg",
      },
    },
    {
      stepRunnerKey: "sys:assign",
      inputParams: {
        input: { varKey: "msg" },
      },
      outputParams: {
        output: "lastLine",
      },
    },
    {
      stepRunnerKey: "sys:evalexpression",
      inputParams: {
        expression: { value: '$="sum=" + (1 + 2 + 3)' },
      },
      outputParams: {
        result: "sum",
      },
    },
  ],
  variables: [
    { key: "msg", defaultValue: "" },
    { key: "lastLine", defaultValue: "" },
    { key: "sum", defaultValue: "" },
  ],
};

export const TRACE_REPEAT_DEMO_XACTION: InlineXActionProgram = {
  title: "_trace_repeat_demo",
  steps: [
    {
      stepRunnerKey: "sys:repeat",
      inputParams: {
        count: { value: "60" },
        repeatDelayMs: { value: "120" },
        startIndex: { value: "0" },
      },
      ifSteps: [
        {
          stepRunnerKey: "sys:evalexpression",
          inputParams: {
            expression: { value: '$="tick "' },
          },
          outputParams: {
            result: "tick",
          },
        },
      ],
    },
  ],
  variables: [{ key: "tick", defaultValue: "" }],
};

/** Synthetic action id for inline xaction trace tabs and serve POST body. */
export function ephemeralXActionTabId(caseId: string): string {
  return `ephemeral:${caseId}`;
}

export function isEphemeralXActionTabId(actionId: string): boolean {
  const id = actionId.trim().toLowerCase();
  return id.startsWith("ephemeral:") || id.startsWith("inline:");
}
