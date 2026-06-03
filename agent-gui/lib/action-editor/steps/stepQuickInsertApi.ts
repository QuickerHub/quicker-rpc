import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import {
  designerHostGrpcPostStepQuickInsertSearchJson,
  designerHostGrpcPostToolboxSearchJson
} from "../shared/designerHostGrpcApi";
import { formatSubProgramIdentifier } from "./subProgramStepIdentifier";
import type { QuickInsertCandidate } from "./stepQuickInsertCandidates";
import type { ToolboxDragPayload } from "./toolboxStepFactory";

/** Must match server StepQuickInsertCatalog.PageSize (20). */
export const STEP_QUICK_INSERT_PAGE_SIZE = 20;

type RunnerPayloadRaw = {
  stepRunnerKey?: string;
  name?: string;
  icon?: string;
  controlFieldValue?: string;
};

type RawSearchItem =
  | {
      kind: "runner";
      id?: string;
      label?: string;
      labelHtml?: string;
      description?: string;
      descriptionHtml?: string;
      payload?: RunnerPayloadRaw;
    }
  | {
      kind: "subprogram";
      id?: string;
      label?: string;
      labelHtml?: string;
      description?: string;
      descriptionHtml?: string;
      subProgramIdentifier?: string;
    };

export type StepQuickInsertSearchResult = {
  items: QuickInsertCandidate[];
  totalCount: number;
  hasMore: boolean;
};

function mapRawItem(raw: RawSearchItem): QuickInsertCandidate | null {
  if (raw.kind === "subprogram") {
    const id = (raw.id ?? "").trim();
    const subProgramIdentifier = (raw.subProgramIdentifier ?? "").trim();
    if (!id || !subProgramIdentifier) {
      return null;
    }
    const label = (raw.label ?? "").trim() || id;
    const description = (raw.description ?? "").trim();
    const labelHtml = typeof raw.labelHtml === "string" && raw.labelHtml.length > 0 ? raw.labelHtml : undefined;
    const descriptionHtml =
      typeof raw.descriptionHtml === "string" && raw.descriptionHtml.length > 0 ? raw.descriptionHtml : undefined;
    return {
      kind: "subprogram",
      id,
      label,
      labelHtml,
      description,
      descriptionHtml,
      searchHaystack: "",
      subProgramIdentifier
    };
  }

  const id = (raw.id ?? "").trim();
  const p = raw.payload;
  const stepRunnerKey = (p?.stepRunnerKey ?? "").trim();
  if (!id || !stepRunnerKey) {
    return null;
  }
  const name = (p?.name ?? "").trim() || stepRunnerKey;
  const payload: ToolboxDragPayload = {
    stepRunnerKey,
    name,
    icon: (p?.icon ?? "").trim() || undefined,
    controlFieldValue: (p?.controlFieldValue ?? "").trim() || undefined
  };
  const label = (raw.label ?? "").trim() || name;
  const description = (raw.description ?? "").trim();
  const labelHtml = typeof raw.labelHtml === "string" && raw.labelHtml.length > 0 ? raw.labelHtml : undefined;
  const descriptionHtml =
    typeof raw.descriptionHtml === "string" && raw.descriptionHtml.length > 0 ? raw.descriptionHtml : undefined;
  return {
    kind: "runner",
    id,
    label,
    labelHtml,
    description,
    descriptionHtml,
    searchHaystack: "",
    payload
  };
}

function parseSearchResponseBody(data: unknown): StepQuickInsertSearchResult {
  if (typeof data !== "object" || data === null) {
    return { items: [], totalCount: 0, hasMore: false };
  }
  const rec = data as Record<string, unknown>;
  const itemsRaw = rec.items;
  const totalCount = typeof rec.totalCount === "number" ? rec.totalCount : 0;
  const hasMore = Boolean(rec.hasMore);
  const items: QuickInsertCandidate[] = [];
  if (Array.isArray(itemsRaw)) {
    for (const el of itemsRaw) {
      if (typeof el !== "object" || el === null) {
        continue;
      }
      const o = el as Record<string, unknown>;
      const kind = o.kind === "subprogram" ? "subprogram" : "runner";
      const mapped = mapRawItem({ kind, ...o } as RawSearchItem);
      if (mapped) {
        items.push(mapped);
      }
    }
  }
  return { items, totalCount, hasMore };
}

function buildSubProgramPayload(subPrograms: ActionSubProgram[]): Array<{
  id: string;
  name: string;
  description: string;
  identifier: string;
}> {
  const out: Array<{ id: string; name: string; description: string; identifier: string }> = [];
  for (const sp of subPrograms) {
    const identifier = formatSubProgramIdentifier(sp).trim();
    if (!identifier) {
      continue;
    }
    out.push({
      id: (sp.id ?? "").trim(),
      name: (sp.name ?? "").trim(),
      description: (sp.description ?? "").trim(),
      identifier
    });
  }
  return out;
}

/**
 * DesignerHost gRPC DesignerHostCatalogService.PostStepQuickInsertSearch — pinyin-augmented catalog slice.
 */
export async function fetchStepQuickInsertSearch(
  baseUrl: string,
  args: { keyword: string; skip: number; subPrograms: ActionSubProgram[] },
  signal?: AbortSignal
): Promise<StepQuickInsertSearchResult> {
  const body = {
    keyword: args.keyword,
    skip: args.skip,
    subPrograms: buildSubProgramPayload(args.subPrograms)
  };
  const json = await designerHostGrpcPostStepQuickInsertSearchJson(baseUrl, JSON.stringify(body), signal);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("step-quick-insert/search: invalid JSON");
  }
  return parseSearchResponseBody(data);
}

/**
 * POST /api/toolbox/search — toolbox-only runner catalog (control fields do not match on parent title).
 */
export async function fetchToolboxModuleSearch(
  baseUrl: string,
  args: { keyword: string; skip: number },
  signal?: AbortSignal
): Promise<StepQuickInsertSearchResult> {
  const json = await designerHostGrpcPostToolboxSearchJson(
    baseUrl,
    JSON.stringify({ keyword: args.keyword, skip: args.skip }),
    signal
  );
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("toolbox/search: invalid JSON");
  }
  return parseSearchResponseBody(data);
}
