export type CursorSdkExample = {
  id: string;
  label: string;
  hint: string;
  text: string;
  readOnly?: boolean;
};

export type CursorSdkExampleGroup = {
  id: string;
  label: string;
  examples: CursorSdkExample[];
};

export const CURSOR_SDK_EXAMPLE_GROUPS: CursorSdkExampleGroup[] = [
  {
    id: "smoke",
    label: "冒烟",
    examples: [
      {
        id: "health",
        label: "qkrpc_health",
        hint: "验证 qkrpc MCP 连通",
        text: "Call qkrpc_health once. Reply in one sentence: ok or the error message.",
        readOnly: true,
      },
      {
        id: "action-list",
        label: "列出动作",
        hint: "qkrpc_action list",
        text: "Use qkrpc to list up to 5 actions in the workspace. Reply with action names only.",
        readOnly: true,
      },
    ],
  },
  {
    id: "authoring",
    label: "编写",
    examples: [
      {
        id: "discover-expr",
        label: "发现表达式步骤",
        hint: "step-runner search + get",
        text: "Find the step-runner for inline Quicker expressions ($=). Use step-runner search then get. Reply with the stepRunnerKey only.",
        readOnly: true,
      },
      {
        id: "clip-lines",
        label: "剪贴板截取动作",
        hint: "创建带 $= 的动作",
        text: "Create a new Quicker action named __bench_clip_lines__ that keeps only the first 10 lines of clipboard text using $= expression. Use workspace_program patch on disk after step-runner get. Reply with the action id when done.",
      },
      {
        id: "patch-existing",
        label: "修改已有动作",
        hint: "search → get → patch",
        text: "Search the workspace for an action related to clipboard. If found, add a comment step at the top describing the action. Use qkrpc_action_get, edit .quicker/ on disk, then workspace_program patch.",
      },
    ],
  },
];

export function getDefaultCursorSdkExample(): CursorSdkExample {
  return CURSOR_SDK_EXAMPLE_GROUPS[0]!.examples[0]!;
}
