import { ActionSubProgram } from "@/lib/action-editor/types/common";
import { ActionSubProgramKind } from "@/lib/action-editor/subprograms/subProgramUi";

export type GlobalSubProgramCatalogItem = {
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  callIdentifier?: string;
};

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}

/** Map qkrpc subprogram.list items to ActionSubProgram rows for quick-insert / step IO. */
export function mapGlobalCatalogToActionSubPrograms(
  items: GlobalSubProgramCatalogItem[],
): ActionSubProgram[] {
  const out: ActionSubProgram[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const id = (raw.id ?? "").trim();
    const callIdentifier = (raw.callIdentifier ?? "").trim();
    const name = (raw.name ?? "").trim();
    const dedupeKey = id || callIdentifier || name;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const displayName =
      callIdentifier.length > 0
        ? callIdentifier
        : id.length > 0
          ? `%%${id}`
          : name;

    out.push(
      ActionSubProgram.fromPartial({
        id,
        name: displayName,
        description: (raw.description ?? "").trim(),
        icon: (raw.icon ?? "").trim(),
        kind: ActionSubProgramKind.GlobalLink,
        stepCount: 0,
        variableCount: 0,
        variables: [],
        steps: [],
        subPrograms: [],
      }),
    );
  }

  return out;
}

/** Merge embedded action subPrograms with global library catalog (Designer XProgramEditor parity). */
export function mergeSubProgramsForStepEditor(
  embedded: readonly ActionSubProgram[],
  globalCatalog: readonly ActionSubProgram[],
): ActionSubProgram[] {
  const seen = new Set<string>();
  for (const sp of embedded) {
    const id = (sp.id ?? "").trim();
    const name = (sp.name ?? "").trim();
    if (id) seen.add(id);
    if (name) seen.add(name);
  }

  const extra = globalCatalog.filter((sp) => {
    const id = (sp.id ?? "").trim();
    const name = (sp.name ?? "").trim();
    if (id && seen.has(id)) return false;
    if (name && seen.has(name)) return false;
    return id.length > 0 || name.length > 0;
  });

  return [...embedded.map((sp) => ActionSubProgram.fromPartial(sp)), ...extra];
}

export async function fetchGlobalSubProgramCatalog(
  signal?: AbortSignal,
): Promise<ActionSubProgram[]> {
  const res = await fetch("/api/subprogram/list?limit=200", {
    cache: "no-store",
    signal,
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    items?: unknown[];
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  const items: GlobalSubProgramCatalogItem[] = [];
  for (const el of data.items ?? []) {
    if (typeof el !== "object" || el === null) continue;
    const row = el as Record<string, unknown>;
    items.push({
      id: readString(row, "id", "Id"),
      name: readString(row, "name", "Name"),
      description: readString(row, "description", "Description"),
      icon: readString(row, "icon", "Icon"),
      callIdentifier: readString(row, "callIdentifier", "CallIdentifier"),
    });
  }

  return mapGlobalCatalogToActionSubPrograms(items);
}
