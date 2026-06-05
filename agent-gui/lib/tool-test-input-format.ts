/** Compact display / default serialization for /tool-test step inputs. */

export function defaultStepInputJson(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

/** One-line summary for sidebar (e.g. `q=移动 n=8`). */
export function formatToolTestInputCompact(input: Record<string, unknown>): string {
  const parts: string[] = [];

  if ("query" in input) {
    const q = input.query;
    const qs =
      q === "" ? '""' : typeof q === "string" ? q : JSON.stringify(q);
    parts.push(`q=${qs}`);
  }
  if ("limit" in input && input.limit !== undefined) {
    parts.push(`n=${String(input.limit)}`);
  }
  if ("topic" in input && typeof input.topic === "string") {
    parts.push(`topic=${input.topic}`);
  }
  if ("id" in input && input.id !== undefined) {
    parts.push(`id=${JSON.stringify(input.id)}`);
  }
  if ("clearCaptured" in input) {
    parts.push(`clearCaptured=${String(input.clearCaptured)}`);
  }
  const shellDescription =
    "description" in input && typeof input.description === "string"
      ? input.description.trim()
      : "";
  if (shellDescription) {
    parts.push(
      shellDescription.length > 56
        ? `${shellDescription.slice(0, 53)}…`
        : shellDescription,
    );
  }
  if (!shellDescription && "command" in input && typeof input.command === "string") {
    const cmd = input.command.trim().replace(/\s+/g, " ");
    parts.push(`cmd=${cmd.length > 48 ? `${cmd.slice(0, 45)}…` : cmd}`);
  }
  if (!shellDescription && "script" in input && typeof input.script === "string") {
    const first = input.script.trim().split(/\r?\n/)[0] ?? "";
    const line = first.replace(/\s+/g, " ");
    parts.push(`script=${line.length > 40 ? `${line.slice(0, 37)}…` : line}`);
  }
  if (!shellDescription && "scriptPath" in input && typeof input.scriptPath === "string") {
    parts.push(`path=${input.scriptPath}`);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  const keys = Object.keys(input);
  if (keys.length === 0) {
    return "{}";
  }

  return JSON.stringify(input);
}
