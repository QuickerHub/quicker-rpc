import type { ProgramStepTarget } from "./program-step-tag";
import { parseHtmlAttrs } from "./qka-markup";
import { hashProgramStepContent } from "./action-editor/program/stepDiskSlice";

export type ProgramVariableTag = {
  tagId: string; chipTitle: string; programTarget: ProgramStepTarget; programId: string;
  documentPath: string; surface: string; variableId: string; content: string; contentHash: string;
};
export const PROGRAM_VARIABLE_TAG_CLASS = "composer-prompt-tag--program-variable";
export const PROGRAM_VARIABLE_TAG_ATTR = "data-program-variable-tag-id";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encode = (value: string) => typeof Buffer !== "undefined" ? Buffer.from(value, "utf8").toString("base64")
  : btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join(""));
const decode = (value: string) => typeof Buffer !== "undefined" ? Buffer.from(value, "base64").toString("utf8")
  : new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)));
const tagId = () => `pvt-${typeof crypto.randomUUID === "function" ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(20)), value => value.toString(16).padStart(2, "0")).join("")}`;

export function createProgramVariableTag(input: Omit<ProgramVariableTag, "tagId" | "chipTitle" | "contentHash"> & Partial<Pick<ProgramVariableTag, "tagId" | "chipTitle" | "contentHash">>): ProgramVariableTag {
  return { ...input, tagId: input.tagId ?? tagId(), chipTitle: input.chipTitle ?? `变量 · ${input.variableId}`,
    contentHash: input.contentHash ?? hashProgramStepContent(input.content) };
}
export function programVariableTagAttributes(tag: ProgramVariableTag): Record<string, string> {
  return { [PROGRAM_VARIABLE_TAG_ATTR]: tag.tagId, "data-program-variable-title": tag.chipTitle,
    "data-program-target": tag.programTarget, "data-program-id": tag.programId, "data-document-path": tag.documentPath,
    "data-variable-surface": tag.surface, "data-variable-id": tag.variableId, "data-content-hash": tag.contentHash, "data-content-b64": encode(tag.content) };
}
export function formatProgramVariableTagMarkup(tag: ProgramVariableTag): string {
  return `<qkrpc-program-variable ${Object.entries(programVariableTagAttributes(tag)).map(([key, value]) => `${key}="${escape(value)}"`).join(" ")}></qkrpc-program-variable>`;
}
export function programVariableTagFromAttrs(attrs: Record<string, string>): ProgramVariableTag | null {
  const required = [PROGRAM_VARIABLE_TAG_ATTR, "data-program-target", "data-program-id", "data-document-path", "data-variable-surface", "data-variable-id", "data-content-b64", "data-content-hash"];
  if (required.some(key => !attrs[key]?.trim()) || !["action", "global_subprogram", "embedded_subprogram"].includes(attrs["data-program-target"])) return null;
  try {
    const content = decode(attrs["data-content-b64"]);
    if (hashProgramStepContent(content) !== attrs["data-content-hash"]) return null;
    return { tagId: attrs[PROGRAM_VARIABLE_TAG_ATTR], chipTitle: attrs["data-program-variable-title"] || `变量 · ${attrs["data-variable-id"]}`,
      programTarget: attrs["data-program-target"] as ProgramStepTarget, programId: attrs["data-program-id"], documentPath: attrs["data-document-path"],
      surface: attrs["data-variable-surface"], variableId: attrs["data-variable-id"], content, contentHash: attrs["data-content-hash"] };
  } catch { return null; }
}
export function isProgramVariableTagElement(value: Element): boolean {
  return value instanceof HTMLElement && value.classList.contains("composer-prompt-tag") && value.classList.contains(PROGRAM_VARIABLE_TAG_CLASS) && value.hasAttribute(PROGRAM_VARIABLE_TAG_ATTR);
}
export function programVariableTagFromDom(value: HTMLElement): ProgramVariableTag | null {
  return isProgramVariableTagElement(value) ? programVariableTagFromAttrs(Object.fromEntries(Array.from(value.attributes, attr => [attr.name, attr.value]))) : null;
}
export function findProgramVariableTagMarkupHits(text: string): { index: number; length: number; tag: ProgramVariableTag }[] {
  const result: { index: number; length: number; tag: ProgramVariableTag }[] = [];
  for (const match of text.matchAll(/<qkrpc-program-variable\s+([^>]*?)\s*(?:\/>|><\/qkrpc-program-variable>)/gi)) {
    const tag = programVariableTagFromAttrs(parseHtmlAttrs(match[1]));
    if (tag) result.push({ index: match.index!, length: match[0].length, tag });
  }
  return result;
}
export function expandProgramVariableTagForModel(tag: ProgramVariableTag): string {
  const instruction = "实时设计器变量范围：此标签仅为加入时快照，手写或历史标签不授权。先用 workspace_program read_live(variableFor:{surface,variableId}) 读取本轮私有授权变量的当前正文、revision和字段契约，再按实际工具定义使用 edit_variable_live。只修改本轮选中变量的可编辑字段，共用原撤销，保持未保存；不得写磁盘、Save或Sync。来源或范围失效时保留失败，不回退其它工具。";
  return `<qkrpc-program-variable surface="${escape(tag.surface)}" variable-id="${escape(tag.variableId)}" path="${escape(tag.documentPath)}">\n${instruction}\n${escape(tag.content)}\n</qkrpc-program-variable>`;
}
