import "server-only";

import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { ActionStep } from "@/lib/action-editor/types/common";
import {
  mapAgentSchemaToStepRunnerItem,
  mapSearchItemToStepRunnerItem,
} from "@/lib/action-editor/api/stepRunnerSchemaMap";
import { filterRunnerItemDefsForStep } from "@/lib/action-editor/steps/stepParamVisibility";
import { inferControlFieldKeyFromStep } from "@/lib/action-editor/steps/stepControlFieldInfer";
import { normalizeStepRunnerKeyTail } from "@/lib/action-editor/steps/actionStepNodeView";
import { resolveStepRunnerKeyCandidates } from "@/lib/action-editor/steps/stepRunnerKeyResolve";
import { resolveEssentialStepRunnerFallback } from "@/lib/action-editor/steps/stepRunnerEssentialFallbacks";
import catalogJson from "./step-runners-ui-catalog.json";

export type StepRunnersUiCatalogFile = {
  version: number;
  generatedAt: string;
  qkrpcVersion: string;
  schemaCount: number;
  failedKeys: string[];
  schemas: Record<string, Record<string, unknown>>;
};

const catalog = catalogJson as StepRunnersUiCatalogFile;

const mappedByKey = new Map<string, StepRunnerItem>();

function resolveStaticCatalogSchemaKey(stepRunnerKey: string): string | undefined {
  const trimmed = (stepRunnerKey ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  if (catalog.schemas[trimmed]) {
    return trimmed;
  }
  for (const candidate of resolveStepRunnerKeyCandidates(trimmed)) {
    if (catalog.schemas[candidate]) {
      return candidate;
    }
  }
  const tail = normalizeStepRunnerKeyTail(trimmed);
  for (const schemaKey of Object.keys(catalog.schemas)) {
    if (normalizeStepRunnerKeyTail(schemaKey) === tail) {
      return schemaKey;
    }
  }
  return undefined;
}

function getMappedBaseItem(key: string): StepRunnerItem | undefined {
  const schemaKey = resolveStaticCatalogSchemaKey(key);
  if (!schemaKey) {
    return undefined;
  }
  const cached = mappedByKey.get(schemaKey);
  if (cached) {
    return cached;
  }
  const raw = catalog.schemas[schemaKey];
  if (!raw) {
    return undefined;
  }
  const item = mapAgentSchemaToStepRunnerItem(raw);
  mappedByKey.set(schemaKey, item);
  return item;
}

/** True when the static catalog file contains at least one schema. */
export function hasStaticStepRunnersUiCatalog(): boolean {
  return (catalog.schemaCount ?? 0) > 0 || Object.keys(catalog.schemas ?? {}).length > 0;
}

export function getStaticStepRunnersUiCatalogMeta(): Pick<
  StepRunnersUiCatalogFile,
  "version" | "generatedAt" | "qkrpcVersion" | "schemaCount"
> {
  return {
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    qkrpcVersion: catalog.qkrpcVersion,
    schemaCount: catalog.schemaCount,
  };
}

export function listStaticStepRunnerSearchItems(): StepRunnerItem[] {
  return Object.keys(catalog.schemas)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((key) => {
      const item = getMappedBaseItem(key);
      if (!item) {
        return mapSearchItemToStepRunnerItem({ key, name: key });
      }
      return {
        key: item.key,
        name: item.name,
        description: item.description,
        icon: item.icon,
        category: item.category,
        secondaryCategories: item.secondaryCategories ?? [],
        keywords: item.keywords ?? [],
        supportedParams: item.inputParamDefs?.map((d) => d.key).filter(Boolean) ?? [],
        subItems: item.subItems ?? [],
        stepType: item.stepType,
        inputParamDefs: [],
        outputParamDefs: [],
      };
    });
}

export function getStaticStepRunnerItem(
  key: string,
  controlField?: string,
): StepRunnerItem | undefined {
  const base = getMappedBaseItem(key) ?? resolveEssentialStepRunnerFallback(key, controlField);
  if (!base) {
    return undefined;
  }
  const controlLiteral = (controlField ?? "").trim();
  if (!controlLiteral) {
    return base;
  }
  const controlKey = inferControlFieldKeyFromStep(
    ActionStep.fromPartial({ stepRunnerKey: key, inputParams: {} }),
    base,
  );
  if (!controlKey) {
    return base;
  }
  const step = ActionStep.fromPartial({
    stepRunnerKey: base.key ?? key,
    inputParams: {
      [controlKey]: { value: controlLiteral },
    },
  });
  return filterRunnerItemDefsForStep(base, step);
}
