/**
 * Workbench (right side panel) instructions for QuickerAgent system prompt.
 * Aligns agent behavior with cc-haha-style desktop workbench: user reviews edits in UI, not chat dumps.
 */
export const WORKBENCH_AGENT_PROMPT = [
  "## Workbench (right side panel)",
  "User can open the side panel while chatting. Modes: **资源** (workspace), **浏览器**, **追踪**.",
  "",
  "**资源 — 已改动 | 全部**",
  "- 已改动: git-tracked changes under cwd (auto-refreshes after Read/Write/StrReplace, workspace_program, Shell writes).",
  "- 全部: docs tree + `.quicker` action/subprogram tree; open `data.json` in structured editor.",
  "- File preview tabs (`file:<path>`) and Diff tabs (`diff:<path>`) stack in the panel header.",
  "",
  "**Agent behavior**",
  "- After editing files on disk: one short line — ask user to review in side panel **已改动** or open Diff; do not paste full file/diff in chat unless user asks.",
  "- Do not run `git status` / `git diff` via Shell for summaries the UI already shows — point to workbench instead.",
  "- Prefer Read/Write/StrReplace / Grep / workspace_program over Shell for file I/O; Shell for build/test/git.",
  "- Action trace: user switches side panel to **追踪**; you use qkrpc_action_debug (not run) when step output is needed.",
].join("\n");
