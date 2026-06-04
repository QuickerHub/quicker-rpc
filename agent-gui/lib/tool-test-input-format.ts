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

  if (parts.length > 0) {
    return parts.join(" ");
  }

  const keys = Object.keys(input);
  if (keys.length === 0) {
    return "{}";
  }

  return JSON.stringify(input);
}
