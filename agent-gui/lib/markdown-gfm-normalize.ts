/**
 * GFM tables swallow the next line when it does not start with `|` and there is
 * no blank line in between (common in authoring docs). Insert separators.
 */
export function normalizeMarkdownGfmTables(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);
    const next = lines[i + 1];
    if (next === undefined) continue;
    if (!isGfmTableRow(line)) continue;
    if (isGfmTableDelimiter(next)) continue;
    if (isGfmTableRow(next)) continue;
    if (next.trim() === "") continue;
    out.push("");
  }

  return out.join("\n");
}

function isGfmTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isGfmTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  return trimmed
    .slice(1, -1)
    .split("|")
    .every((cell) => /^[\s:-]+$/.test(cell));
}
