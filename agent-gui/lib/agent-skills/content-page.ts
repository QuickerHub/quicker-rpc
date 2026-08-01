export type SkillPage = {
  content: string;
  offset: number;
  nextOffset: number | null;
  totalChars: number;
  truncated: boolean;
};

export function pageSkillContent(
  content: string,
  offset: number,
  limit: number,
): SkillPage {
  const start = Math.min(Math.max(0, offset), content.length);
  const end = Math.min(content.length, start + limit);
  return {
    content: content.slice(start, end),
    offset: start,
    nextOffset: end < content.length ? end : null,
    totalChars: content.length,
    truncated: end < content.length,
  };
}

