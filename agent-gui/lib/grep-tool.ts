/** Client-safe Grep host tool id (Cursor-style ripgrep search). */

export { GREP_TOOL } from "@/lib/host-tool-constants";
import { GREP_TOOL } from "@/lib/host-tool-constants";

export function isGrepToolName(toolName: string): boolean {
  return toolName === GREP_TOOL;
}
