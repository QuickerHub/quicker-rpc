import { nativeIconHexToCss } from "./icon-color";

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

/** V1 retains native color tokens; V2's geometry color is already CSS. The spec disambiguates them. */
export function faIconGeometryFill(geometry: { spec?: string; color?: string }): string {
  const literal = /^fa:[a-z][a-z0-9_]*_[a-z0-9_]*:(#[0-9a-f]+)$/iu.exec(geometry.spec?.trim() ?? "")?.[1];
  return (literal ? nativeIconHexToCss(literal) : undefined) ?? (geometry.color?.trim() || "currentColor");
}

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
