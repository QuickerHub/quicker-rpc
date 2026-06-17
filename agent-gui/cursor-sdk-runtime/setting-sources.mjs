const ALLOWED = new Set([
  "project",
  "user",
  "team",
  "mdm",
  "plugins",
  "all",
]);

/** @returns {import("@cursor/sdk").LocalAgentOptions["settingSources"]} */
export function parseSettingSources(raw) {
  const value =
    raw?.trim()
    || process.env.CURSOR_SDK_SETTING_SOURCES?.trim()
    || "project,user";
  if (value === "all") {
    return ["all"];
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!ALLOWED.has(part)) {
      throw new Error(
        `Invalid setting source "${part}". Allowed: ${[...ALLOWED].join(", ")}`,
      );
    }
  }
  return parts;
}
