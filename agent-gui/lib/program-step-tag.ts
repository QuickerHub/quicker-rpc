import { formatProgramStepTagPrompt } from "@/lib/program-step-tag-prompt";
import { parseHtmlAttrs } from "@/lib/qka-markup";
import { hashProgramStepContent } from "@/lib/action-editor/program/stepDiskSlice";

export type ProgramStepTarget =
  | "action"
  | "global_subprogram"
  | "embedded_subprogram";

export type ProgramStepTag = {
  tagId: string;
  chipTitle: string;
  programTarget: ProgramStepTarget;
  programId: string;
  subProgramId?: string;
  dataJsonPath: string;
  nodePath: string;
  stepRunnerKey: string;
  note?: string;
  content: string;
  contentHash: string;
  startLine: number;
  endLine: number;
  designerStepId?: string;
};

const PROGRAM_STEP_TAG_RE = new RegExp(
  "<qkrpc-program-step\\s+([^>]*?)>([\\s\\S]*?)<\\/qkrpc-program-step>",
  "gi",
);

export const PROGRAM_STEP_TAG_CLASS = "composer-prompt-tag--program-step";
export const PROGRAM_STEP_TAG_ATTR = "data-program-step-tag-id";

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readAttr(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key]?.trim();
  return value || undefined;
}

function readNumberAttr(attrs: Record<string, string>, key: string): number | null {
  const raw = attrs[key]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function encodeContentB64(content: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(content, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeContentB64(encoded: string): string | null {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(encoded, "base64").toString("utf8");
    }
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function programStepDisplayTitle(input: {
  stepRunnerKey: string;
  note?: string;
  nodePath: string;
}): string {
  const runner = input.stepRunnerKey.trim() || "step";
  const note = input.note?.trim();
  const shortNote =
    note && note.length > 24 ? `${note.slice(0, 21)}…` : note;
  const pathLabel = `steps/${input.nodePath.replace(/\//g, "/")}`;
  if (shortNote) {
    return `${runner} · ${shortNote}`;
  }
  return `${runner} · [${pathLabel}]`;
}

export function createProgramStepTag(
  input: Omit<ProgramStepTag, "tagId" | "chipTitle" | "contentHash"> & {
    tagId?: string;
    chipTitle?: string;
    contentHash?: string;
  },
): ProgramStepTag {
  const content = input.content;
  return {
    ...input,
    tagId: input.tagId ?? `pst-${Date.now().toString(36)}`,
    chipTitle:
      input.chipTitle
      ?? programStepDisplayTitle({
        stepRunnerKey: input.stepRunnerKey,
        note: input.note,
        nodePath: input.nodePath,
      }),
    contentHash: input.contentHash ?? hashProgramStepContent(content),
  };
}

export function formatProgramStepTagMarkup(tag: ProgramStepTag): string {
  const attrs = [
    `${PROGRAM_STEP_TAG_ATTR}="${escapeAttrValue(tag.tagId)}"`,
    `data-program-step-title="${escapeAttrValue(tag.chipTitle)}"`,
    `data-program-target="${escapeAttrValue(tag.programTarget)}"`,
    `data-program-id="${escapeAttrValue(tag.programId)}"`,
    `data-data-json-path="${escapeAttrValue(tag.dataJsonPath)}"`,
    `data-node-path="${escapeAttrValue(tag.nodePath)}"`,
    `data-step-runner="${escapeAttrValue(tag.stepRunnerKey)}"`,
    `data-content-hash="${escapeAttrValue(tag.contentHash)}"`,
    `data-start-line="${tag.startLine}"`,
    `data-end-line="${tag.endLine}"`,
    `data-content-b64="${escapeAttrValue(encodeContentB64(tag.content))}"`,
  ];
  if (tag.subProgramId?.trim()) {
    attrs.push(`data-subprogram-id="${escapeAttrValue(tag.subProgramId.trim())}"`);
  }
  if (tag.note?.trim()) {
    attrs.push(`data-step-note="${escapeAttrValue(tag.note.trim())}"`);
  }
  if (tag.designerStepId?.trim()) {
    attrs.push(
      `data-designer-step-id="${escapeAttrValue(tag.designerStepId.trim())}"`,
    );
  }
  return `<qkrpc-program-step ${attrs.join(" ")}></qkrpc-program-step>`;
}

export function isProgramStepTagElement(el: Element): boolean {
  return (
    el instanceof HTMLElement
    && el.classList.contains("composer-prompt-tag")
    && el.classList.contains(PROGRAM_STEP_TAG_CLASS)
    && el.hasAttribute(PROGRAM_STEP_TAG_ATTR)
  );
}

export function programStepTagFromDom(el: HTMLElement): ProgramStepTag | null {
  if (!isProgramStepTagElement(el)) return null;
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value;
  }
  return programStepTagFromAttrs(attrs);
}

export function programStepTagFromAttrs(
  attrs: Record<string, string>,
): ProgramStepTag | null {
  const tagId = readAttr(attrs, PROGRAM_STEP_TAG_ATTR);
  const programTarget = readAttr(attrs, "data-program-target") as
    | ProgramStepTarget
    | undefined;
  const programId = readAttr(attrs, "data-program-id");
  const dataJsonPath = readAttr(attrs, "data-data-json-path");
  const nodePath = readAttr(attrs, "data-node-path");
  const stepRunnerKey = readAttr(attrs, "data-step-runner");
  const contentB64 = readAttr(attrs, "data-content-b64");
  const contentHash = readAttr(attrs, "data-content-hash");
  const startLine = readNumberAttr(attrs, "data-start-line");
  const endLine = readNumberAttr(attrs, "data-end-line");
  if (
    !tagId
    || !programTarget
    || !programId
    || !dataJsonPath
    || !nodePath
    || !stepRunnerKey
    || !contentB64
    || !contentHash
    || startLine == null
    || endLine == null
  ) {
    return null;
  }
  const content = decodeContentB64(contentB64);
  if (content == null) return null;

  return {
    tagId,
    chipTitle:
      readAttr(attrs, "data-program-step-title")
      ?? programStepDisplayTitle({ stepRunnerKey, nodePath }),
    programTarget,
    programId,
    subProgramId: readAttr(attrs, "data-subprogram-id"),
    dataJsonPath,
    nodePath,
    stepRunnerKey,
    note: readAttr(attrs, "data-step-note"),
    content,
    contentHash,
    startLine,
    endLine,
    designerStepId: readAttr(attrs, "data-designer-step-id"),
  };
}

export function expandProgramStepTagForModel(tag: ProgramStepTag): string {
  return formatProgramStepTagPrompt(tag);
}

export function findProgramStepTagMarkupHits(text: string): Array<{
  index: number;
  length: number;
  tag: ProgramStepTag;
}> {
  const hits: Array<{
    index: number;
    length: number;
    tag: ProgramStepTag;
  }> = [];
  const re = new RegExp(PROGRAM_STEP_TAG_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const tag = programStepTagFromAttrs(parseHtmlAttrs(match[1]));
    if (!tag) continue;
    hits.push({
      index: match.index,
      length: match[0].length,
      tag,
    });
  }
  return hits;
}
