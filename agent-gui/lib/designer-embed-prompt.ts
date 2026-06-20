import type { ActionDesignerThreadRef } from "@/lib/action-designer-thread";
import type { ActionScopeHint, ScopedActionRef } from "@/lib/action-scope";
import type { DesignerWindowContext } from "@/lib/designer-context-types";
import { formatDesignerStepMentionTitle } from "@/lib/designer-mention-items";

export type ActionDesignerChatContext = ActionDesignerThreadRef;

/** Designer prompt/scope applies only in scoped Action Designer embed, not main QuickerAgent. */
export function resolveActionDesignerForChatTurn(params: {
  designerEmbedScoped?: boolean;
  actionDesigner?: unknown;
}): ActionDesignerChatContext | undefined {
  if (params.designerEmbedScoped !== true) {
    return undefined;
  }
  return parseActionDesignerChatContext(params.actionDesigner);
}

export function parseActionDesignerChatContext(
  value: unknown,
): ActionDesignerChatContext | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const entityId =
    typeof row.entityId === "string" ? row.entityId.trim() : "";
  if (!entityId) return undefined;
  return {
    entityId,
    isSubProgram: row.isSubProgram === true,
  };
}

/** Default @ scope when user did not pin another action in the latest message. */
export function mergeDesignerDefaultActionScope(
  scope: ActionScopeHint,
  ref: ActionDesignerChatContext | undefined,
  title?: string,
): ActionScopeHint {
  if (!ref?.entityId?.trim()) return scope;

  const id = ref.entityId.trim();
  const normalized = id.toLowerCase();
  if (
    scope.pinnedLatestAll.some((item) => item.id.trim().toLowerCase() === normalized)
  ) {
    return scope;
  }

  const defaultRef: ScopedActionRef = {
    id,
    title: title?.trim() || undefined,
    source: "designer-default",
  };

  return {
    pinnedLatest: scope.pinnedLatest ?? defaultRef,
    pinnedLatestAll: [...scope.pinnedLatestAll, defaultRef],
  };
}

/** System prompt block: user is in Action Designer embed; edit this program by default. */
export function formatDesignerEmbedContextForSystem(
  ref: ActionDesignerChatContext,
  window: DesignerWindowContext | null,
): string {
  const entityId = ref.entityId.trim();
  const kindLabel = ref.isSubProgram ? "公共子程序" : "Quicker 动作";
  const workspaceTarget = ref.isSubProgram ? "global_subprogram" : "action";
  const title = window?.title?.trim() || "(未命名)";

  const lines = [
    "## Action Designer 嵌入（默认编辑目标）",
    "用户正在 Quicker **动作设计器**左侧编辑程序；本对话 Agent Tab 嵌在设计器内。",
    "除非用户 @ 引用其他动作/子程序，否则**默认编辑下面这个程序**（不是随便选 workspace 里的别的动作）。",
    "",
    `- 类型：${kindLabel}`,
    `- 标题：${title}`,
    `- entityId：\`${entityId}\``,
    `- 改程序体：\`workspace_program\` \`target=${workspaceTarget}\` \`id=${entityId}\` → patch / edit_data（磁盘 \`.quicker/\` + patch）`,
    "- 设计器已打开时 patch 会先同步到窗口内存；保存/入库走 Quicker 原生或插件工具。",
    "- step 参数：必须先 \`qkrpc_step_runner_search\` → \`qkrpc_step_runner_get\`，禁止猜 inputParams。",
    "- 用户选中步骤时 @ 可引用；未 @ 时仍以整个程序为默认范围。",
  ];

  const steps = window?.selectedSteps ?? [];
  if (steps.length > 0) {
    lines.push("", "### 设计器当前选中的步骤（用户焦点）");
    for (const step of steps.slice(0, 8)) {
      const runner =
        step.stepRunnerKey?.trim() ? ` · ${step.stepRunnerKey.trim()}` : "";
      lines.push(
        `- ${formatDesignerStepMentionTitle(step)}（index ${step.index}${runner}）`,
      );
    }
  }

  return lines.join("\n");
}
