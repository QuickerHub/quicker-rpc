import type { DesignerCatalogPort } from "./designerCatalogPort";
import { DesignerCatalogError } from "./designerCatalogContext";

export type DesignerFaPageQuery = { query?: string | null; style?: string | null; skip?: number; take?: number };
export type NormalizedDesignerFaPageQuery = Readonly<{ query: string; style: string | null; skip: number; take: number }>;
export type DesignerFaPage = Readonly<NormalizedDesignerFaPageQuery & {
  names: readonly string[];
  totalCount: number;
  hasMore: boolean;
}>;

const int32 = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Same criteria/window normalization as the native SearchPage, independent of legacy search. */
export function normalizeDesignerFaPageQuery(input: unknown): NormalizedDesignerFaPageQuery {
  const invalid = () => new DesignerCatalogError("INVALID_FA_PAGE_REQUEST", "FA paging requires string criteria and finite Int32 skip/take values.", 400);
  if (!object(input)) throw invalid();
  if ((input.query != null && typeof input.query !== "string") || (input.style != null && typeof input.style !== "string")
    || (input.skip !== undefined && !int32(input.skip)) || (input.take !== undefined && !int32(input.take))) throw invalid();
  const query = (input.query as string | null | undefined)?.trim() ?? "";
  let style = (input.style as string | null | undefined)?.trim() ?? "";
  if (style.toLowerCase() === "brand") style = "Brands";
  const skip = Math.max(0, (input.skip as number | undefined) ?? 0);
  const take = input.take === undefined || (input.take as number) <= 0 ? 96 : Math.min(input.take as number, 300);
  return Object.freeze({ query, style: style || null, skip, take });
}

/** A successful transport is insufficient: every returned page fact must match the requested view. */
export function readDesignerFaPage(value: unknown, expected: NormalizedDesignerFaPageQuery): DesignerFaPage {
  const invalid = () => new DesignerCatalogError("INVALID_FA_PAGE_RESPONSE", "The bound host returned an invalid or inconsistent Font Awesome page.", 503);
  if (!object(value) || !Array.isArray(value.names) || value.names.length > 300
    || value.names.some((name) => typeof name !== "string" || !name.trim())
    || !int32(value.totalCount) || value.totalCount < 0 || !int32(value.skip) || !int32(value.take)
    || typeof value.query !== "string" || (value.style !== null && typeof value.style !== "string")
    || typeof value.hasMore !== "boolean") throw invalid();
  if (value.query !== expected.query || value.style !== expected.style || value.skip !== expected.skip || value.take !== expected.take
    || value.names.length !== Math.min(expected.take, Math.max(0, value.totalCount - expected.skip))
    || value.hasMore !== (value.skip + value.names.length < value.totalCount)) throw invalid();
  return Object.freeze({ ...expected, names: Object.freeze([...value.names] as string[]), totalCount: value.totalCount, hasMore: value.hasMore });
}

/** A document owns both page cache and request lifetime; no unresolved owner becomes a global reader. */
export async function fetchDesignerFaPage(port: DesignerCatalogPort | undefined, input: DesignerFaPageQuery,
  signal?: AbortSignal): Promise<DesignerFaPage> {
  signal?.throwIfAborted();
  if (!port?.documentBound) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "A resolved document target is required for icon paging.");
  const query = normalizeDesignerFaPageQuery(input);
  const key = `fa-page\0${JSON.stringify(query)}`;
  const cached = port.get<DesignerFaPage>(key);
  if (cached) return cached;
  return port.shared(key, async (ownedSignal) => {
    ownedSignal.throwIfAborted();
    const response = await port.request<unknown>("/api/fa/page", query, ownedSignal);
    ownedSignal.throwIfAborted();
    const page = readDesignerFaPage(response, query);
    ownedSignal.throwIfAborted();
    port.set(key, page);
    return page;
  }, signal);
}
