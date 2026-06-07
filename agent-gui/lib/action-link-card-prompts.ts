import { formatActionTagMarkup } from "@/lib/compose-user-message";

export type ActionLinkCardPrompt = {
  id: string;
  label: string;
  hint: string;
};

export type ActionLinkCardPromptContext = {
  actionId: string;
  title: string;
  /** Optional run/trace param from the card input. */
  param?: string;
};

export const ACTION_LINK_CARD_PROMPTS: ActionLinkCardPrompt[] = [
  {
    id: "move-panel",
    label: "放到面板",
    hint: "移动到指定面板或分组",
  },
  {
    id: "improve-meta",
    label: "优化展示",
    hint: "改标题、说明、图标",
  },
  {
    id: "hotkey",
    label: "快捷键",
    hint: "设置或调整触发键",
  },
  {
    id: "explain",
    label: "解释步骤",
    hint: "说明动作在做什么",
  },
];

function actionRefMarkup(actionId: string, title: string): string {
  return formatActionTagMarkup({ id: actionId, title: title.trim() || actionId });
}

/** Composer draft starter: action tag first, then an open phrase the user can finish inline. */
export function buildActionLinkCardPromptMessage(
  promptId: string,
  ctx: ActionLinkCardPromptContext,
): string | null {
  const title = ctx.title.trim() || ctx.actionId;
  const tag = actionRefMarkup(ctx.actionId, title);
  switch (promptId) {
    case "move-panel":
      return `${tag}请帮我放到指定面板或分组，目标是`;
    case "improve-meta":
      return `${tag}请优化标题、说明和图标，我的偏好是`;
    case "hotkey":
      return `${tag}请设置合适的快捷键，我希望使用`;
    case "explain":
      return `${tag}请用通俗语言解释步骤逻辑，我想了解`;
    case "trace": {
      const param = ctx.param?.trim();
      const paramBit = param ? `，运行参数 ${param}` : "";
      return `${tag}请 trace 调试运行动作${paramBit}，侧栏查看步骤时间线，我想排查`;
    }
    default:
      return null;
  }
}
