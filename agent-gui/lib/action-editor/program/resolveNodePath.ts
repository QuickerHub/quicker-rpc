import type { ActionStep } from "@/lib/action-editor/types/common";

/**
 * Resolves a designer step to a disk nodePath (0-based indices, if/else branches).
 * Matches QuickerRpc.AgentModel StepNodeResolver token rules.
 */
export function resolveNodePath(
  items: ActionStep[],
  stepId: string,
  pathPrefix: string[] = [],
): string | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.stepId === stepId) {
      return [...pathPrefix, String(index)].join("/");
    }
    const ifSteps = item.ifSteps ?? [];
    if (ifSteps.length > 0) {
      const inIf = resolveNodePath(ifSteps, stepId, [
        ...pathPrefix,
        String(index),
        "if",
      ]);
      if (inIf) return inIf;
    }
    const elseSteps = item.elseSteps ?? [];
    if (elseSteps.length > 0) {
      const inElse = resolveNodePath(elseSteps, stepId, [
        ...pathPrefix,
        String(index),
        "else",
      ]);
      if (inElse) return inElse;
    }
  }
  return null;
}

export type ParsedNodePathToken =
  | { kind: "index"; index: number }
  | { kind: "branch"; branch: "ifSteps" | "elseSteps"; index: number };

/** Parses nodePath like `1` or `2/if/0` into traversal tokens. */
export function parseNodePathTokens(nodePath: string): ParsedNodePathToken[] | null {
  const raw = nodePath
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (raw.length === 0) return null;

  const tokens: ParsedNodePathToken[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i]!;
    if (/^\d+$/.test(token)) {
      tokens.push({ kind: "index", index: Number(token) });
      continue;
    }
    const branchLower = token.toLowerCase();
    const branch =
      branchLower === "if" || branchLower === "ifsteps"
        ? "ifSteps"
        : branchLower === "else" || branchLower === "elsesteps"
          ? "elseSteps"
          : null;
    if (!branch) return null;
    const indexToken = raw[++i];
    if (!indexToken || !/^\d+$/.test(indexToken)) return null;
    tokens.push({ kind: "branch", branch, index: Number(indexToken) });
  }
  return tokens;
}
