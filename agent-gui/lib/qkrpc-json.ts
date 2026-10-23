/** Preserve Int64 CAS versions before JSON.parse can round them to a Number. */
export function parseQkrpcJson(text: string): unknown {
  // Validate the original grammar before replacing tokens; invalid numeric syntax must stay invalid.
  const parsed: unknown = JSON.parse(text);
  const tokens = [...text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!/^-?\d+$/.test(token[0]) || Number.isSafeInteger(Number(token[0]))
      || tokens[i - 1]![0] !== ":" || !tokens[i - 2]![0].startsWith('"')) continue;
    const key: unknown = JSON.parse(tokens[i - 2]![0]);
    if (key !== "editVersion" && key !== "EditVersion") continue;
    replacements.push({ start: token.index!, end: token.index! + token[0].length, value: JSON.stringify(token[0]) });
  }
  let precise = text;
  if (!replacements.length) return parsed;
  for (const replacement of replacements.reverse()) {
    precise = precise.slice(0, replacement.start) + replacement.value + precise.slice(replacement.end);
  }
  return JSON.parse(precise) as unknown;
}
