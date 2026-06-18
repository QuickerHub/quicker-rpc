export type ChatSystemPromptBlocks = {
  baseSystem: string;
  contextSystemSuffix?: string;
  designerEmbedBlock?: string;
  launcherCacheBlock?: string;
  scopeBlock?: string;
  titleInstruction?: string | null;
  titleTest: boolean;
};

/** Stable prefix first; only append blocks that must change per turn at the end. */
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
    blocks.designerEmbedBlock,
    blocks.launcherCacheBlock,
    blocks.titleInstruction,
    blocks.contextSystemSuffix,
  ]
    .filter((block): block is string => Boolean(block?.trim()))
    .join("\n\n");
}
