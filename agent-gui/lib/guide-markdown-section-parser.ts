/** Splits guide markdown into indexable sections (aligns with AgentModel GuideMarkdownSectionParser). */

export type MarkdownSection = {
  heading: string;
  slug: string;
  body: string;
};

const H2_RE = /^##\s+(.+)$/gm;
const H1_RE = /^#\s+(.+)$/gm;

function slugify(heading: string): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "section";
  return slug.length > 80 ? slug.slice(0, 80).replace(/-+$/, "") : slug;
}

/** ## sections for workflow-style guides. */
export function parseH2Sections(markdown: string): MarkdownSection[] {
  if (!markdown?.trim()) return [];

  const matches = [...markdown.matchAll(H2_RE)];
  if (matches.length === 0) return [];

  return matches.map((match, i) => {
    const heading = match[1]?.trim() ?? "";
    const bodyStart = match.index! + match[0].length;
    const bodyEnd =
      i + 1 < matches.length ? matches[i + 1]!.index! : markdown.length;
    return {
      heading,
      slug: slugify(heading),
      body: markdown.slice(bodyStart, bodyEnd).trim(),
    };
  });
}

/**
 * # sections after document title — KC module docs use H1 for major sections.
 * Falls back to ## when only one top-level # exists.
 */
export function parseIndexableSections(markdown: string): MarkdownSection[] {
  if (!markdown?.trim()) return [];

  const h1Matches = [...markdown.matchAll(H1_RE)];
  if (h1Matches.length > 1) {
    return h1Matches.slice(1).map((match, i) => {
      const heading = match[1]?.trim() ?? "";
      const bodyStart = match.index! + match[0].length;
      const next = h1Matches[i + 2];
      const bodyEnd = next?.index ?? markdown.length;
      return {
        heading,
        slug: slugify(heading),
        body: markdown.slice(bodyStart, bodyEnd).trim(),
      };
    });
  }

  const h2 = parseH2Sections(markdown);
  if (h2.length > 0) return h2;

  return [];
}

export function tryExtractSectionBody(
  markdown: string,
  sectionHeading: string,
): string | null {
  if (!sectionHeading.trim()) return null;
  const target = sectionHeading.trim().toLowerCase();
  for (const section of parseIndexableSections(markdown)) {
    if (section.heading.trim().toLowerCase() === target) {
      return section.body;
    }
  }
  return null;
}
