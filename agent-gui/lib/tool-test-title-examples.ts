/** One-click samples for /tool-test → 对话标题. */
export type TitleTestExample = {
  id: string;
  label: string;
  description: string;
  userText: string;
  assistantText?: string;
};

export type TitleTestExampleGroup = {
  id: string;
  label: string;
  examples: readonly TitleTestExample[];
};

export const DEFAULT_TITLE_TEST_EXAMPLE_ID = "clear-clipboard-action";

export const TITLE_TEST_EXAMPLE_GROUPS: readonly TitleTestExampleGroup[] = [
  {
    id: "basics",
    label: "基础",
    examples: [
      {
        id: "clear-clipboard-action",
        label: "长首句 · 写剪贴板动作",
        description: "中文长需求，应压成短标题",
        userText:
          "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。",
      },
      {
        id: "vague-hi",
        label: "极短 · 你好",
        description: "含糊开场，靠模型补主题",
        userText: "你好",
      },
      {
        id: "vague-with-assistant",
        label: "用户短 + 助手已回复",
        description: "标题应参考助手内容",
        userText: "帮看一下",
        assistantText:
          "已找到 3 个剪贴板相关动作，建议在「剪贴板去重」上增加表达式步骤。",
      },
    ],
  },
  {
    id: "authoring",
    label: "写动作",
    examples: [
      {
        id: "patch-existing-action",
        label: "改已有动作",
        description: "patch / 加步骤类需求",
        userText:
          "在 _rpc_test 里加两步：先用 sys:evalexpression 读剪贴板行数，再用提示框显示 before/after。",
      },
      {
        id: "new-mouse-action",
        label: "新建 · 鼠标键盘",
        description: "具体操作描述",
        userText:
          "帮我做一个动作：当前窗口失去焦点时，把选中文本复制到变量 %sel%，再模拟 Ctrl+V 粘贴到记事本。",
      },
      {
        id: "subprogram-call",
        label: "公共子程序",
        description: "子程序搜索/调用语境",
        userText:
          "用 subprogram search 找「剪贴板」相关的公共子程序，在新建动作里用 sys:subprogram 调用最合适的那个。",
      },
      {
        id: "action-tag-only",
        label: "@ 动作标签无正文",
        description: "仅有引用标签时标题取什么",
        userText:
          '<qkrpc-action-tag data-id="e0ac442e-6241-4f89-9a20-494dee157b89" data-title="剪贴板去重"></qkrpc-action-tag>',
      },
      {
        id: "vague-write-action",
        label: "含糊 · 写个动作",
        description: "无具体领域，看模型泛化",
        userText: "写个动作",
      },
      {
        id: "authoring-with-assistant",
        label: "写动作 + 助手已给方案",
        description: "用户短，助手含动作名/步骤",
        userText: "按刚才说的改一下",
        assistantText:
          "建议在「剪贴板去重」动作第 2 步后插入 sys:fileoperation 写回剪贴板，并用 sys:evalexpression 统计行数变化。",
      },
    ],
  },
  {
    id: "english",
    label: "英文",
    examples: [
      {
        id: "en-new-clipboard-action",
        label: "New clipboard action",
        description: "Long English; title should stay ~6 words",
        userText:
          "Create a new Quicker action: read clipboard text, dedupe lines, sort ascending, write back, and show before/after line counts in a message box.",
      },
      {
        id: "en-patch-steps",
        label: "Patch action steps",
        description: "Edit existing action in English",
        userText:
          "Patch action _rpc_test to add an sys:evalexpression step that counts clipboard lines, then a user prompt for the delta.",
      },
    ],
  },
] as const;

/** Flat list for tests and custom default lookup. */
export const TITLE_TEST_EXAMPLES: readonly TitleTestExample[] =
  TITLE_TEST_EXAMPLE_GROUPS.flatMap((g) => g.examples);

export function getDefaultTitleTestExample(): TitleTestExample {
  return (
    TITLE_TEST_EXAMPLES.find((e) => e.id === DEFAULT_TITLE_TEST_EXAMPLE_ID)
    ?? TITLE_TEST_EXAMPLES[0]!
  );
}
