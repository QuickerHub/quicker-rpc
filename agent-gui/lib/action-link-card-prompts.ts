import { formatActionLinkBarMarkup } from "@/lib/action-link-markup";

export type ActionLinkCardPrompt = {
  id: string;
  label: string;
  hint: string;
};

export type ActionLinkCardPromptContext = {
  actionId: string;
  title: string;
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

function actionRefMarkup(actionId: string, use: "edit" | "workspace" = "edit"): string {
  return formatActionLinkBarMarkup(actionId, [use]);
}

export function buildActionLinkCardPromptMessage(
  promptId: string,
  ctx: ActionLinkCardPromptContext,
): string | null {
  const title = ctx.title.trim() || ctx.actionId;
  switch (promptId) {
    case "move-panel":
      return [
        `帮我把动作「${title}」放到我指定的面板或分组；需要我补充信息时先问我。`,
        actionRefMarkup(ctx.actionId, "edit"),
      ].join("\n");
    case "improve-meta":
      return [
        `请优化动作「${title}」的标题、说明和图标；先确认我的偏好再修改。`,
        actionRefMarkup(ctx.actionId, "edit"),
      ].join("\n");
    case "hotkey":
      return [
        `帮动作「${title}」设置合适的快捷键；先检查冲突再给出建议。`,
        actionRefMarkup(ctx.actionId, "edit"),
      ].join("\n");
    case "explain":
      return [
        `用通俗语言解释动作「${title}」的步骤逻辑，并指出可改进之处。`,
        actionRefMarkup(ctx.actionId, "workspace"),
      ].join("\n");
    default:
      return null;
  }
}
