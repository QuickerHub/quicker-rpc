export type ChatSystemPromptBlocks = {
  baseSystem: string;
  contextSystemSuffix?: string;
  designerEmbedBlock?: string;
  launcherCacheBlock?: string;
  scopeBlock?: string;
  titleInstruction?: string | null;
  titleTest: boolean;
  benchMode?: boolean;
  benchInstruction?: string;
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
    blocks.benchMode && blocks.benchInstruction?.trim()
      ? blocks.benchInstruction.trim()
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
