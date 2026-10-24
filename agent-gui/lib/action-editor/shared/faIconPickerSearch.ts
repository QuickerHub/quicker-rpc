import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import { fetchDesignerFaPage, normalizeDesignerFaPageQuery, type DesignerFaPage } from "../catalog/designerFaPage";

export const FA_ICON_PAGE_SIZE = 96;
export const FA_REGULAR_BRANDS_STYLE = "RegularBrands";
export type PickerStyleFilter = "" | "Solid" | "Light" | typeof FA_REGULAR_BRANDS_STYLE;

const STYLE_ALIASES: Record<string, string> = {
  light: "Light", regular: "Regular", solid: "Solid", brand: "Brands", brands: "Brands",
};
const URL_LIKE_PREFIXES = ["http://", "https://", "url:", "res:", "local-icon:", "data:"];
const NON_FA_PREFIXES = [...URL_LIKE_PREFIXES, "qk:", "sc:", "iconify:", "icon:"];

/** Same FA/URL distinction as the Quicker Designer's shared faIconSearch. */
export function isUrlLikeIconSpec(value: string): boolean {
  const spec = value.trim().toLowerCase();
  return Boolean(spec && (spec.startsWith("//") || URL_LIKE_PREFIXES.some((prefix) => spec.startsWith(prefix))));
}

export function parseFaIconSpec(spec: string): { name: string; style: string; color: string } {
  const raw = (spec ?? "").trim();
  const lower = raw.toLowerCase();
  if (!raw || !lower.startsWith("fa:") && (lower.startsWith("//") || lower.includes("://") || NON_FA_PREFIXES.some((prefix) => lower.startsWith(prefix))))
    return { name: "", style: "Light", color: "" };
  let body = lower.startsWith("fa:") ? raw.slice(3).trim() : raw;
  let color = "";
  const separator = body.indexOf(":");
  if (separator >= 0) {
    const candidate = body.slice(separator + 1).trim();
    if (candidate && !candidate.startsWith("//") && !candidate.includes("://") && !candidate.includes("/")) {
      color = candidate;
      body = body.slice(0, separator).trim();
    }
  }
  const underscore = body.indexOf("_");
  const token = (underscore >= 0 ? body.slice(0, underscore) : "").trim();
  return { name: body, style: STYLE_ALIASES[token.toLowerCase()] ?? (token || "Light"), color };
}

export function buildFaIconSpec(name: string, color = ""): string {
  const trimmedName = name.trim();
  if (!trimmedName) return "";
  const trimmedColor = color.trim();
  return trimmedColor ? `fa:${trimmedName}:${trimmedColor}` : `fa:${trimmedName}`;
}

/** Unknown styles select the native default Light chip without changing the original spec. */
export function toPickerStyleFilter(style: string | null | undefined): PickerStyleFilter {
  const token = (style ?? "").trim();
  if (token === "Regular" || token === "Brands") return FA_REGULAR_BRANDS_STYLE;
  return token === "Solid" ? "Solid" : "Light";
}

/** Virtual [Regular..., Brands...] paging; target/cache/cancellation stay with the document port. */
export async function searchPickerFaIcons(port: DesignerCatalogPort | undefined,
  input: { query?: string | null; style: PickerStyleFilter; skip?: number; take?: number }, signal?: AbortSignal): Promise<DesignerFaPage> {
  signal?.throwIfAborted();
  const query = normalizeDesignerFaPageQuery(input);
  if (input.style !== FA_REGULAR_BRANDS_STYLE) {
    const result = await fetchDesignerFaPage(port, query, signal);
    signal?.throwIfAborted();
    return result;
  }
  const regular = await fetchDesignerFaPage(port, { ...query, style: "Regular" }, signal);
  signal?.throwIfAborted();
  const remaining = query.take - regular.names.length;
  const brands = await fetchDesignerFaPage(port, { ...query, style: "Brands",
    skip: remaining > 0 ? Math.max(0, query.skip - regular.totalCount) : 0,
    take: remaining > 0 ? remaining : 1 }, signal);
  signal?.throwIfAborted();
  const names = Object.freeze(remaining > 0 ? [...regular.names, ...brands.names] : [...regular.names]);
  const totalCount = regular.totalCount + brands.totalCount;
  return Object.freeze({ ...query, style: FA_REGULAR_BRANDS_STYLE, names, totalCount, hasMore: query.skip + names.length < totalCount });
}
