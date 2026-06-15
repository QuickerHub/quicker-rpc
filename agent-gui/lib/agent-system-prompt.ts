export type ChatSystemPromptBlocks = {
  baseSystem: string;
  contextSystemSuffix?: string;
  launcherCacheBlock?: string;
  recoveryDecisionBlock?: string;
  runtimeContextBlock?: string;
  scopeBlock?: string;
  titleInstruction?: string | null;
  titleTest: boolean;
  toolFeedbackBlock?: string;
  turnStateBlock?: string;
};

export function composeChatSystemPrompt(
  blocks: ChatSystemPromptBlocks,
): string {
  const systemWithScope = blocks.scopeBlock
    ? `${blocks.baseSystem}\n\n${blocks.scopeBlock}`
    : blocks.baseSystem;

  return [
    blocks.titleTest
      ? "You are running in title-test mode for Quicker Agent GUI (/tool-test)."
      : null,
    systemWithScope,
    blocks.runtimeContextBlock,
    blocks.turnStateBlock,
    blocks.toolFeedbackBlock,
    blocks.recoveryDecisionBlock,
    blocks.launcherCacheBlock,
    blocks.titleInstruction,
    blocks.contextSystemSuffix,
  ]
    .filter((block): block is string => Boolean(block?.trim()))
    .join("\n\n");
}
