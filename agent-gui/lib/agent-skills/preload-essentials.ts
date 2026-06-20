/** Section titles extracted from tier-2 skill bodies for default session preload. */
export const AUTHORING_ESSENTIAL_SECTIONS = [
  "Pattern traps (do not guess)",
  "P0–P7",
  "Hard rules",
  "Workspace",
] as const;

export const EVAL_EXPRESSION_ESSENTIAL_SECTIONS = [
  "Pick (P4)",
  "Two surfaces (read before writing)",
] as const;

/** Extract `##` sections from markdown by exact heading title. */
export function extractMarkdownSections(
  markdown: string,
  sectionTitles: readonly string[],
): string {
  const wanted = new Set(sectionTitles.map((t) => t.toLowerCase()));
  const headings: Array<{ title: string; start: number }> = [];
  const regex = /^## (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    headings.push({ title: match[1]!.trim(), start: match.index });
  }

  const chunks: string[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const { title, start } = headings[i]!;
    if (!wanted.has(title.toLowerCase())) continue;
    const end = i + 1 < headings.length ? headings[i + 1]!.start : markdown.length;
    chunks.push(markdown.slice(start, end).trimEnd());
  }
  return chunks.join("\n\n");
}
