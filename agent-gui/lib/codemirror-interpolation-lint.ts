import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import {
  extractProgramVariableKeys,
  findInterpolationPrefixWarnings,
} from "@/lib/quicker-interpolation-lint";

const warnMark = Decoration.mark({
  class: "cm-interpolation-lint-warning",
  attributes: {
    title: "缺少 $$ 插值前缀",
  },
});

export function isProgramDataJsonPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/data.json") || normalized === "data.json";
}

/** @param variableKeySourceText JSON used to discover `variables[].key` (may be wider than the editor doc). */
export function createInterpolationLintExtension(
  variableKeySourceText: string,
  path: string,
): Extension | undefined {
  if (!isProgramDataJsonPath(path)) {
    return undefined;
  }

  const variableKeys = extractProgramVariableKeys(variableKeySourceText);
  if (variableKeys.size === 0) {
    return undefined;
  }

  return EditorView.decorations.compute(["doc"], (state) => {
    const doc = state.doc.toString();
    const hits = findInterpolationPrefixWarnings(doc, variableKeys);
    if (hits.length === 0) {
      return Decoration.none;
    }

    const builder = new RangeSetBuilder<Decoration>();
    const sorted = [...hits].sort((a, b) => a.from - b.from);
    for (const hit of sorted) {
      if (hit.from < 0 || hit.to > doc.length || hit.from >= hit.to) {
        continue;
      }
      builder.add(hit.from, hit.to, warnMark);
    }
    return builder.finish();
  });
}
