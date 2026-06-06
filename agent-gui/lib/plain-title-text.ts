/** Strip markup and normalize whitespace for tab / header titles. */
export function plainTitleText(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const normalized = withoutTags.replace(/\s+/g, " ").trim();
  return normalized || "新对话";
}
