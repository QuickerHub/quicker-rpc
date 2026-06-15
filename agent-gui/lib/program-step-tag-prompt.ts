import type { ProgramStepTag } from "@/lib/program-step-tag";

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Model-facing expansion for a pinned program step slice. */
export function formatProgramStepTagPrompt(tag: ProgramStepTag): string {
  const attrs = [
    `target="${escapeXmlText(tag.programTarget)}"`,
    `program-id="${escapeXmlText(tag.programId)}"`,
    `path="${escapeXmlText(tag.dataJsonPath)}"`,
    `node-path="${escapeXmlText(tag.nodePath)}"`,
    `step-runner="${escapeXmlText(tag.stepRunnerKey)}"`,
    `lines="${tag.startLine}-${tag.endLine}"`,
    `content-hash="${escapeXmlText(tag.contentHash)}"`,
  ];
  if (tag.subProgramId?.trim()) {
    attrs.push(`subprogram-id="${escapeXmlText(tag.subProgramId.trim())}"`);
  }
  if (tag.note?.trim()) {
    attrs.push(`note="${escapeXmlText(tag.note.trim())}"`);
  }
  if (tag.designerStepId?.trim()) {
    attrs.push(`designer-step-id="${escapeXmlText(tag.designerStepId.trim())}"`);
  }

  const body = [
    "【单步编辑范围 — 仅允许修改下方 JSON 对象，禁止改动其他步骤或整文件重写】",
    "",
    "编辑协议：",
    "1. 使用 workspace_program edit_data，oldString 必须等于下方 JSON 块原文（含缩进与字段顺序）。",
    "2. newString 为修改后的单个 step 对象 JSON（合法 step wire 形状，勿含 stepId）。",
    "3. 完成后 workspace_program diagnostics；若 oldString 不匹配，提示用户重新从设计器添加该步骤。",
    "4. 禁止依赖 designer-step-id 定位磁盘；使用 node-path + content 锚点。",
    "",
    "```json",
    tag.content,
    "```",
  ].join("\n");

  return `<qkrpc-program-step ${attrs.join(" ")}>\n${escapeXmlText(body)}\n</qkrpc-program-step>`;
}
