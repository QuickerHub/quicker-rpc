/** Natural-language presets for /tool-test → Prompt 对话 (not tool-name regression scripts). */
export type PromptChatExample = {
  id: string;
  label: string;
  hint: string;
  text: string;
  /** Unlikely to create/patch actions — safe smoke. */
  readOnly?: boolean;
};

export type PromptChatExampleGroup = {
  id: string;
  label: string;
  examples: readonly PromptChatExample[];
};

export const DEFAULT_PROMPT_CHAT_EXAMPLE_ID = "vague-clipboard-idea";

export const PROMPT_CHAT_EXAMPLE_GROUPS: readonly PromptChatExampleGroup[] = [
  {
    id: "basics",
    label: "开场",
    examples: [
      {
        id: "vague-hi",
        label: "极短寒暄",
        hint: "含糊开场",
        text: "你好",
        readOnly: true,
      },
      {
        id: "vague-clipboard-idea",
        label: "剪贴板能做什么",
        hint: "开放问题，勿指定工具",
        text: "我想整理剪贴板里的文本，一般可以怎么做？",
        readOnly: true,
      },
      {
        id: "vague-help-look",
        label: "帮看一下",
        hint: "短句 + 需追问",
        text: "帮看一下我这边和剪贴板有关的动作。",
        readOnly: true,
      },
    ],
  },
  {
    id: "authoring",
    label: "写动作",
    examples: [
      {
        id: "clip-dedup-sort",
        label: "剪贴板去重排序",
        hint: "需求描述，不提 step-runner",
        text: "新建一个动作：读剪贴板，按行去空、去重、排序后写回，并告诉我处理前后各多少行。",
      },
      {
        id: "window-vscode",
        label: "窗口标题分支",
        hint: "业务逻辑为主",
        text: "做一个动作：如果当前前台窗口标题里包含 Visual Studio Code 就最大化，否则弹窗提示不是 VS Code。",
      },
      {
        id: "form-to-clipboard",
        label: "表单收集",
        hint: "多字段用户故事",
        text: "新建动作，弹窗让我填标题、标签和优先级，确认后把结果整理成 Markdown 清单写到剪贴板。",
      },
      {
        id: "http-show-field",
        label: "HTTP 取数",
        hint: "结果展示",
        text: "新建动作：请求 https://httpbin.org/get ，从返回 JSON 里取出 origin 并在窗口里显示。",
      },
      {
        id: "metadata-smoke",
        label: "只要元数据",
        hint: "空程序 + 标题说明图标",
        text: "新建测试动作，标题叫 _agent_gui_smoke，说明写「空程序仅测元数据」，顺便选个合适的图标，先不要加步骤。",
      },
    ],
  },
  {
    id: "workspace",
    label: "改已有",
    examples: [
      {
        id: "find-clip-actions",
        label: "找剪贴板动作",
        hint: "检索类",
        text: "我本地或 Quicker 里有哪些和剪贴板相关的动作？简单说说就行。",
        readOnly: true,
      },
      {
        id: "add-clip-step",
        label: "加一步读剪贴板",
        hint: "编辑已有项目",
        text: "在工作区里找个已有动作，给它加一步：把剪贴板内容读到变量 clip 里。",
      },
      {
        id: "rename-only",
        label: "只改标题",
        hint: "小改动",
        text: "把某个已有动作的标题改成「_rename_smoke」，其它别动。",
      },
      {
        id: "long-expression-file",
        label: "表达式太长",
        hint: "外置脚本倾向",
        text: "剪贴板内容是 JSON 时校验并格式化写回，不合法就提示错误；表达式比较长的话别全塞在一步里。",
      },
    ],
  },
  {
    id: "subprogram",
    label: "子程序",
    examples: [
      {
        id: "call-run-sub",
        label: "调用 Run 子程序",
        hint: "自然描述",
        text: "新建或改一个测试动作，加一步调用 QuickerRpc 的 Run 公共子程序（或名字最接近的那个）。",
      },
    ],
  },
];

export function getDefaultPromptChatExample(): PromptChatExample {
  for (const group of PROMPT_CHAT_EXAMPLE_GROUPS) {
    const found = group.examples.find((p) => p.id === DEFAULT_PROMPT_CHAT_EXAMPLE_ID);
    if (found) return found;
  }
  return PROMPT_CHAT_EXAMPLE_GROUPS[0]!.examples[0]!;
}

export function getPromptChatExampleGroups(): PromptChatExampleGroup[] {
  return PROMPT_CHAT_EXAMPLE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    examples: group.examples,
  }));
}
