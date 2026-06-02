export type FaIconGeometry = {
  spec: string;
  enumName: string;
  path: string;
  width: number;
  height: number;
  color?: string;
  label?: string;
  unicode?: number;
};

export function isFaIconSpec(spec: string | undefined): boolean {
  return Boolean(spec?.trim().toLowerCase().startsWith("fa:"));
}

export function isHttpIconUrl(spec: string | undefined): boolean {
  const s = spec?.trim().toLowerCase() ?? "";
  return s.startsWith("https://") || s.startsWith("http://");
}

export function uniqueFaSpecs(specs: Iterable<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of specs) {
    const s = raw?.trim();
    if (!s || !isFaIconSpec(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
