/** Presentation contributions only; execution and policy stay in the existing harness. */
export type WorkbenchFeatureTarget =
  | { kind: "panel"; panel: "settings" | "explorer" | "browser" }
  | { kind: "command"; command: "launcher" | "release-preview" }
  | { kind: "route"; href: "/tool-test" };

type WorkbenchFeatureDefinition = {
  id: string;
  label: string;
  hint: string;
  target: WorkbenchFeatureTarget;
  availability: "always" | "development" | "debug";
};

export const WORKBENCH_FEATURES = [
  {
    id: "settings", label: "设置", hint: "模型、工具、工作目录",
    target: { kind: "panel", panel: "settings" }, availability: "always",
  },
  {
    id: "explorer", label: "资源", hint: "动作与子程序工程目录",
    target: { kind: "panel", panel: "explorer" }, availability: "always",
  },
  {
    id: "browser", label: "浏览器", hint: "内嵌 Agent 操控浏览器",
    target: { kind: "panel", panel: "browser" }, availability: "always",
  },
  {
    id: "launcher", label: "小窗", hint: "独立小窗，Enter 一次性发送",
    target: { kind: "command", command: "launcher" }, availability: "always",
  },
  {
    id: "tool-test", label: "测试", hint: "工具套件与 Prompt 测试",
    target: { kind: "route", href: "/tool-test" }, availability: "development",
  },
  {
    id: "release-preview", label: "预览", hint: "查看发布版用户所见界面",
    target: { kind: "command", command: "release-preview" }, availability: "debug",
  },
] as const satisfies readonly WorkbenchFeatureDefinition[];

export type WorkbenchFeature = (typeof WORKBENCH_FEATURES)[number];
export type WorkbenchFeatureId = WorkbenchFeature["id"];

export function visibleWorkbenchFeatures(options: {
  development: boolean;
  debug: boolean;
}): readonly WorkbenchFeature[] {
  return WORKBENCH_FEATURES.filter((feature) =>
    feature.availability === "always"
    || (feature.availability === "development" && options.development)
    || (feature.availability === "debug" && options.debug),
  );
}
