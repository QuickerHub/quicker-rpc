import type { QuickInsertCandidate } from "../steps/stepQuickInsertCandidates";
import {
  pickCollisionContextSuffix,
  resolveControlPresetDisplayName,
  type ControlPresetCatalogItem
} from "./toolboxPresetDisplay";
import type { ToolboxDragPayload } from "../steps/toolboxStepFactory";

export type ToolboxSearchRunnerHit = Extract<QuickInsertCandidate, { kind: "runner" }>;

export type ToolboxSearchSubItem = {
  key: string;
  name: string;
  description?: string;
  /** Shown after the name when sibling labels collide. */
  contextSuffix?: string;
};

export type ToolboxSearchNode = {
  key: string;
  name: string;
  icon?: string;
  subItems: ToolboxSearchSubItem[];
};

export type ToolboxSearchTreeMeta = {
  parentKeys: Set<string>;
  parentOrder: string[];
  subHitsByParent: Map<string, Set<string>>;
  subKeyOrderByParent: Map<string, string[]>;
  parentHitByKey: Map<string, ToolboxSearchRunnerHit>;
  subHitByComposite: Map<string, ToolboxSearchRunnerHit>;
};

/** Use server labelHtml only when it highlights the same display name (no extra key/keyword suffix). */
export function toolboxDisplayNameHtml(
  displayName: string,
  labelHtml: string | undefined,
): string | undefined {
  if (!labelHtml) {
    return undefined;
  }
  const text = labelHtml
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text === displayName ? labelHtml : undefined;
}

export function compositeSubHitKey(parentKey: string, subKey: string): string {
  return `${parentKey}\t${subKey}`;
}

export function isToolboxCapabilityHit(hit: ToolboxSearchRunnerHit): boolean {
  if ((hit.payload.controlFieldValue ?? "").trim()) {
    return true;
  }
  const presets = hit.payload.inputPresets;
  return !!presets && Object.keys(presets).length > 0;
}

export function toolboxCapabilitySubKey(hit: ToolboxSearchRunnerHit): string {
  const cv = (hit.payload.controlFieldValue ?? "").trim();
  if (cv) {
    return cv;
  }
  const pk = (hit.payload.stepRunnerKey ?? "").trim();
  const id = (hit.id ?? "").trim();
  const prefix = `r:${pk}:`;
  if (pk && id.startsWith(prefix) && id.length > prefix.length) {
    return id.slice(prefix.length);
  }
  const presets = hit.payload.inputPresets ?? {};
  return Object.entries(presets)
    .map(([key, value]) => `${key}=${value}`)
    .join(":");
}

export function buildParentToolboxPayload(node: ToolboxSearchNode): ToolboxDragPayload {
  return {
    stepRunnerKey: node.key,
    name: node.name,
    icon: node.icon
  };
}

/** Prefer the first matching capability child so a parent-title drag does not insert a blank module. */
export function bestToolboxSearchInsertPayload(
  node: ToolboxSearchNode,
  searchTreeMeta: ToolboxSearchTreeMeta | null
): ToolboxDragPayload {
  if (!searchTreeMeta) {
    return buildParentToolboxPayload(node);
  }
  const ord = searchTreeMeta.subKeyOrderByParent.get(node.key);
  if (ord && ord.length > 0) {
    const hit = searchTreeMeta.subHitByComposite.get(compositeSubHitKey(node.key, ord[0]!));
    if (hit) {
      return hit.payload;
    }
  }
  return buildParentToolboxPayload(node);
}

/** Group toolbox search API rows under parent nodes; preserve flattened relevance order. */
export function buildToolboxSearchTreeMeta(
  nodes: ToolboxSearchNode[],
  runners: ToolboxSearchRunnerHit[]
): ToolboxSearchTreeMeta {
  const parentKeys = new Set<string>();
  const parentOrder: string[] = [];
  const parentOrderSeen = new Set<string>();
  const subHitsByParent = new Map<string, Set<string>>();
  const subKeyOrderByParent = new Map<string, string[]>();
  const parentHitByKey = new Map<string, ToolboxSearchRunnerHit>();
  const subHitByComposite = new Map<string, ToolboxSearchRunnerHit>();

  const noteParent = (parentKey: string): void => {
    parentKeys.add(parentKey);
    if (!parentOrderSeen.has(parentKey)) {
      parentOrderSeen.add(parentKey);
      parentOrder.push(parentKey);
    }
  };

  const noteSubHit = (parentKey: string, subKey: string, hit: ToolboxSearchRunnerHit): void => {
    noteParent(parentKey);
    if (!subHitsByParent.has(parentKey)) {
      subHitsByParent.set(parentKey, new Set());
    }
    subHitsByParent.get(parentKey)!.add(subKey);
    let ord = subKeyOrderByParent.get(parentKey);
    if (!ord) {
      ord = [];
      subKeyOrderByParent.set(parentKey, ord);
    }
    if (!ord.includes(subKey)) {
      ord.push(subKey);
    }
    subHitByComposite.set(compositeSubHitKey(parentKey, subKey), hit);
  };

  for (const c of runners) {
    const pk = (c.payload.stepRunnerKey ?? "").trim();
    if (!pk) {
      continue;
    }

    if (isToolboxCapabilityHit(c)) {
      noteSubHit(pk, toolboxCapabilitySubKey(c), c);
      continue;
    }

    const top = nodes.find((n) => n.key === pk);
    if (top) {
      noteParent(pk);
      if (!parentHitByKey.has(pk)) {
        parentHitByKey.set(pk, c);
      }
      continue;
    }

    for (const n of nodes) {
      const hitSub = n.subItems.some((s) => (s.key ?? "").trim() === pk);
      if (!hitSub) {
        continue;
      }
      noteSubHit(n.key, pk, c);
      break;
    }
  }

  return { parentKeys, parentOrder, subHitsByParent, subKeyOrderByParent, parentHitByKey, subHitByComposite };
}

export function getToolboxSearchMatchedSubItems(
  node: ToolboxSearchNode,
  searchTreeMeta: ToolboxSearchTreeMeta,
  catalog?: ReadonlyArray<ControlPresetCatalogItem>
): ToolboxSearchSubItem[] {
  const s = searchTreeMeta.subHitsByParent.get(node.key);
  if (!s || s.size === 0) {
    return [];
  }
  const ord = searchTreeMeta.subKeyOrderByParent.get(node.key) ?? [];
  const catalogByKey = new Map(node.subItems.map((sub) => [sub.key, sub]));
  const extra: ToolboxSearchSubItem[] = [];
  for (const sk of ord) {
    if (catalogByKey.has(sk)) {
      continue;
    }
    const hit = searchTreeMeta.subHitByComposite.get(compositeSubHitKey(node.key, sk));
    if (!hit) {
      continue;
    }
    extra.push({
      key: sk,
      name: hit.label,
      description: hit.description
    });
  }
  const picked = [...node.subItems.filter((sub) => s.has(sub.key)), ...extra];
  if (ord.length === 0) {
    return picked;
  }
  const rank = (sk: string): number => {
    const i = ord.indexOf(sk);
    return i < 0 ? ord.length + 1 : i;
  };
  const sorted = picked.sort((a, b) => rank(a.key) - rank(b.key));
  const runner = catalog?.find((it) => (it.key ?? "").trim() === node.key);
  const labels = sorted.map((s) => s.name);
  const contexts = sorted.map((s) => {
    const hit = searchTreeMeta.subHitByComposite.get(compositeSubHitKey(node.key, s.key));
    return resolveControlPresetDisplayName(hit?.payload.inputPresets, runner);
  });
  const suffixes = pickCollisionContextSuffix(labels, contexts);
  return sorted.map((s, i) => {
    const suffix = suffixes[i];
    return suffix ? { ...s, contextSuffix: suffix } : s;
  });
}
