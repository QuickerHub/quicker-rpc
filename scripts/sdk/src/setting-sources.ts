import type { LocalAgentOptions } from "@cursor/sdk";

type SettingSource = NonNullable<LocalAgentOptions["settingSources"]>[number];

const ALLOWED = new Set<SettingSource>([
  "project",
  "user",
  "team",
  "mdm",
  "plugins",
  "all",
]);

/** Parse CURSOR_SDK_SETTING_SOURCES or CLI arg (comma-separated). Default: project only. */
export function parseSettingSources(raw?: string): SettingSource[] {
  const value =
    raw?.trim() ||
    process.env.CURSOR_SDK_SETTING_SOURCES?.trim() ||
    "project";
  if (value === "all") {
    return ["all"];
  }
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!ALLOWED.has(part as SettingSource)) {
      throw new Error(
        `Invalid setting source "${part}". Allowed: ${[...ALLOWED].join(", ")}`,
      );
    }
  }
  return parts as SettingSource[];
}
