/** Shared YAML frontmatter parsing for agent definition files. */

export type ParsedFrontmatter = {
  fields: Record<string, string>;
  body: string;
};

function parseScalarValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const quote = trimmed[0];
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(new RegExp(`\\\\${quote}`, "g"), quote);
  }
  return trimmed;
}

function parseFrontmatterBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = block.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (!match) {
      i += 1;
      continue;
    }

    const key = match[1];
    const rest = match[2];

    if (rest === "" || rest === "|" || rest === ">-" || rest === ">") {
      if (key === "metadata") {
        i += 1;
        while (i < lines.length) {
          const nestedLine = lines[i];
          const metaMatch = /^  (\w[\w-]*):\s*(.*)$/.exec(nestedLine);
          if (!metaMatch) break;
          result[`metadata.${metaMatch[1]}`] = parseScalarValue(metaMatch[2]);
          i += 1;
        }
        continue;
      }

      i += 1;
      const nested: string[] = [];
      while (i < lines.length) {
        const nestedLine = lines[i];
        if (/^\S/.test(nestedLine) && nestedLine.includes(":")) break;
        if (/^  /.test(nestedLine)) {
          nested.push(nestedLine.slice(2));
        } else if (nested.length > 0) {
          break;
        }
        i += 1;
      }
      result[key] = nested.join("\n").trimEnd();
      continue;
    }

    result[key] = parseScalarValue(rest);
    i += 1;
  }

  return result;
}

/** Split YAML frontmatter and markdown body from a definition file. */
export function parseFrontmatterMd(content: string): ParsedFrontmatter {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { fields: {}, body: normalized };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    return { fields: {}, body: normalized };
  }

  const fields = parseFrontmatterBlock(normalized.slice(4, end));
  const body = normalized.slice(end + 5).replace(/^\n/, "");
  return { fields, body };
}

/** Extract nested metadata.* keys into a flat metadata map. */
export function extractMetadataFields(
  fields: Record<string, string>,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith("metadata.")) {
      metadata[k.slice("metadata.".length)] = v;
    }
  }
  return metadata;
}

/** Parse space-separated tool id list from frontmatter. */
export function parseToolList(raw: string | undefined): string[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter(Boolean);
}
