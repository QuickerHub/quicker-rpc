import type { StepRunnerInputParamDef, StepRunnerOutputParamDef } from "../../types/action_query";
type ParamDefinition = Pick<StepRunnerInputParamDef, "key" | "name" | "isMultiLine" | "defaultHighlightType" | "isAdvanced">;
const SCRIPT_KEY = /(?:^|_)(script|code|expr|expression|csharp|jscode|pythoncode|sql|template)(?:$|_)/i;
const SCRIPT_HIGHLIGHT = /^(c#|csharp|js|javascript|ts|typescript|tsx|python|py|sql|tsql|json|xml|xaml|html|css|vb|vba|vbscript|vbs|markdown|md)$/i;
export const SCRIPT_HERO_MAX_MULTILINE_HEIGHT = 560;
export const SCRIPT_HERO_MIN_MULTILINE_HEIGHT = 280;
export function stepLargeParamLanguageBadge(def: Pick<ParamDefinition, "key" | "defaultHighlightType">): string {
  const highlight = def.defaultHighlightType.trim();
  const badges: Record<string, string> = { "c#": "C#", csharp: "C#", js: "JS", javascript: "JS",
    ts: "TS", typescript: "TS", tsx: "TSX", py: "Python", python: "Python", html: "HTML", xhtml: "HTML",
    json: "JSON", vb: "VB", vba: "VB", vbscript: "VB", vbs: "VB", sql: "SQL", tsql: "SQL",
    xml: "XML", xaml: "XML", markdown: "MD", md: "MD" };
  if (highlight) return badges[highlight.toLowerCase()] ?? highlight;
  const key = def.key.toLowerCase();
  if (key.includes("csharp") || key.includes("cs")) return "C#";
  if (key.includes("jscode") || key.includes("js")) return "JS";
  if (key.includes("python")) return "Python";
  if (key.includes("html")) return "HTML";
  if (key.includes("xaml") || key.includes("xml")) return "XML";
  if (key.includes("sql")) return "SQL";
  return "";
}

/** Native script-hero rule. Capture-toolbar visual editing remains a separate editor. */
export function isStepParamScriptHero(def: Pick<ParamDefinition, "key" | "isMultiLine" | "defaultHighlightType">): boolean {
  if (def.key.trim().toLowerCase() === "toolbarscript" || !def.isMultiLine) return false;
  return SCRIPT_HIGHLIGHT.test(def.defaultHighlightType.trim()) || SCRIPT_KEY.test(def.key.trim());
}
export function buildLargeParamLayout<T extends ParamDefinition>(
  visibleInputs: readonly T[], visibleOutputs: readonly Pick<StepRunnerOutputParamDef, "isAdvanced">[],
) {
  return {
    tabs: visibleInputs.filter(isStepParamScriptHero),
    advancedFullRowCount: visibleInputs.filter(def => def.isAdvanced && !isStepParamScriptHero(def)).length
      + visibleOutputs.filter(def => def.isAdvanced).length,
  };
}
export function reconcileLargeParamTab(active: string | null, visibleInputs: readonly ParamDefinition[]): string | null {
  return active === null || visibleInputs.some(def => def.key === active && isStepParamScriptHero(def)) ? active : null;
}
export function nextLargeParamTab(active: string | null, keys: readonly string[], key: string): string | null | undefined {
  const tabs = [null, ...keys], index = Math.max(0, tabs.indexOf(active));
  if (key === "Home") return null;
  if (key === "End") return tabs[tabs.length - 1];
  if (key === "ArrowRight") return tabs[(index + 1) % tabs.length];
  if (key === "ArrowLeft") return tabs[(index + tabs.length - 1) % tabs.length];
  return undefined;
}
