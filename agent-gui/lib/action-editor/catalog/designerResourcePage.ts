import { DesignerCatalogError } from "./designerCatalogContext";
import type { DesignerCatalogPort } from "./designerCatalogPort";

export type DesignerResourceKind = "action" | "global_subprogram";
export const RESOURCE_PAGE_CAPABILITIES = {
  action: "resource.action.page.read", global_subprogram: "resource.globalSubprogram.page.read",
} as const;
export type DesignerResourceQuery = Readonly<{ kind: DesignerResourceKind; scope: "runtimeCatalog"; query: string;
  skip: number; take: number; expectedSnapshotId: string | null }>;
export type DesignerResourceItem = Readonly<{ id: string; title: string; description: string; icon: string;
  editVersion: string; actionType: string | null; callIdentifier: string | null }>;
export type DesignerResourcePage = Readonly<Omit<DesignerResourceQuery, "expectedSnapshotId"> & {
  snapshotId: string; totalCount: number; hasMore: boolean; items: readonly DesignerResourceItem[];
}>;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const int32 = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647;

/** The runtime catalog is a complete captured summary view, not legacy limited search. */
export function normalizeDesignerResourceQuery(input: unknown): DesignerResourceQuery {
  const invalid = () => new DesignerCatalogError("INVALID_RESOURCE_CATALOG_REQUEST", "A supported resource kind, runtimeCatalog scope and Int32 paging window are required.", 400);
  if (!object(input) || (input.kind !== "action" && input.kind !== "global_subprogram")
    || (input.scope !== undefined && (typeof input.scope !== "string" || input.scope.trim() !== "runtimeCatalog"))
    || (input.query != null && typeof input.query !== "string")
    || (input.expectedSnapshotId != null && typeof input.expectedSnapshotId !== "string")
    || (input.skip !== undefined && !int32(input.skip)) || (input.take !== undefined && !int32(input.take))) throw invalid();
  const expectedSnapshotId = (input.expectedSnapshotId as string | null | undefined)?.trim() || null;
  const skip = Math.max(0, (input.skip as number | undefined) ?? 0);
  if (skip && !expectedSnapshotId) throw new DesignerCatalogError("SNAPSHOT_REQUIRED", "Read a first page before requesting the next window.", 400);
  return Object.freeze({ kind: input.kind, scope: "runtimeCatalog", query: (input.query as string | null | undefined)?.trim() ?? "", skip,
    take: input.take === undefined || (input.take as number) <= 0 ? 500 : Math.min(input.take as number, 500), expectedSnapshotId });
}

export function readDesignerResourcePage(value: unknown, expected: DesignerResourceQuery): DesignerResourcePage {
  const invalid = () => new DesignerCatalogError("INVALID_RESOURCE_CATALOG_RESPONSE", "The bound host returned inconsistent resource page facts.", 503);
  if (!object(value) || value.success === false || !Array.isArray(value.items) || value.items.length > expected.take
    || !int32(value.totalCount) || value.totalCount < 0 || typeof value.hasMore !== "boolean"
    || typeof value.snapshotId !== "string" || !value.snapshotId.trim()
    || value.kind !== expected.kind || value.scope !== expected.scope || value.query !== expected.query
    || value.skip !== expected.skip || value.take !== expected.take
    || (expected.expectedSnapshotId !== null && value.snapshotId !== expected.expectedSnapshotId)
    || value.items.length !== Math.min(expected.take, Math.max(0, value.totalCount - expected.skip))
    || value.hasMore !== (expected.skip + value.items.length < value.totalCount)) throw invalid();
  const items = value.items.map((item): DesignerResourceItem => {
    if (!object(item) || typeof item.id !== "string" || !item.id.trim()
      || ["title", "description", "icon", "editVersion"].some((key) => typeof item[key] !== "string")
      || !/^-?\d+$/.test(item.editVersion as string)
      || BigInt(item.editVersion as string) < -9_223_372_036_854_775_808n || BigInt(item.editVersion as string) > 9_223_372_036_854_775_807n
      || (item.actionType != null && typeof item.actionType !== "string") || (item.callIdentifier != null && typeof item.callIdentifier !== "string")) throw invalid();
    return Object.freeze({ id: item.id, title: item.title as string, description: item.description as string, icon: item.icon as string,
      editVersion: item.editVersion as string, actionType: item.actionType as string | null ?? null, callIdentifier: item.callIdentifier as string | null ?? null });
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid();
  return Object.freeze({ kind: expected.kind, scope: expected.scope, query: expected.query, skip: expected.skip, take: expected.take,
    snapshotId: value.snapshotId, totalCount: value.totalCount, hasMore: value.hasMore, items: Object.freeze(items) });
}

export function appendDesignerResourcePage(previous: DesignerResourcePage, page: DesignerResourcePage): DesignerResourcePage {
  if (previous.kind !== page.kind || previous.scope !== page.scope || previous.query !== page.query
    || previous.snapshotId !== page.snapshotId || previous.totalCount !== page.totalCount || page.skip !== previous.items.length
    || page.items.some((item) => previous.items.some((old) => old.id === item.id))) {
    throw new DesignerCatalogError("CATALOG_CHANGED", "The resource catalog changed. Refresh from its first page.");
  }
  return Object.freeze({ ...page, skip: 0, items: Object.freeze([...previous.items, ...page.items]) });
}

/** No persistent page cache: explicit refresh must capture a new native snapshot. */
export async function fetchDesignerResourcePage(port: DesignerCatalogPort | undefined, input: unknown, signal?: AbortSignal): Promise<DesignerResourcePage> {
  signal?.throwIfAborted();
  const query = normalizeDesignerResourceQuery(input);
  if (!port?.documentBound) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "A resolved document target is required for resource paging.");
  if (!port.supportsCapability(RESOURCE_PAGE_CAPABILITIES[query.kind])) throw new DesignerCatalogError("UNSUPPORTED_HOST", "The bound host does not support this resource catalog.");
  const response = await port.request<unknown>("/api/designer/resources/page", query, signal);
  signal?.throwIfAborted();
  return readDesignerResourcePage(response, query);
}
