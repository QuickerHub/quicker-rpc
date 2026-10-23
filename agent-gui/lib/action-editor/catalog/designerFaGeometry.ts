import type { FaIconGeometry } from "../../fa-icon";
import { uniqueFaSpecs } from "../../fa-icon";
import type { DesignerCatalogPort } from "./designerCatalogPort";

const cacheKey = (spec: string) => `fa-geometry\0${spec.trim()}`;

export function readDesignerFaGeometry(port: DesignerCatalogPort | undefined, spec: string): FaIconGeometry | undefined {
  return port?.get<FaIconGeometry>(cacheKey(spec));
}

/** Geometry has the same lifetime and full target as every other document catalog value. */
export async function resolveDesignerFaIcons(port: DesignerCatalogPort | undefined, specs: Iterable<string | undefined>, signal?: AbortSignal): Promise<FaIconGeometry[]> {
  signal?.throwIfAborted();
  if (!port?.remoteEnabled) return [];
  const names = uniqueFaSpecs(specs);
  if (!names.length) return [];
  const missing = names.filter((spec) => !readDesignerFaGeometry(port, spec));
  if (missing.length) {
    await port.shared(`fa-resolve\0${JSON.stringify(missing)}`, async (ownedSignal) => {
      // The existing host resolver accepts at most 80 unique specs per invocation.
      for (let index = 0; index < missing.length; index += 80) {
        const batch = missing.slice(index, index + 80);
        const result = await port.request<{ ok: true; items: FaIconGeometry[]; errors: string[] }>("/api/fa/resolve", { specs: batch }, ownedSignal);
        ownedSignal.throwIfAborted();
        for (const item of result.items) {
          if (batch.includes(item.spec) && typeof item.path === "string" && item.path.trim()
            && Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0) {
            port.set(cacheKey(item.spec), item);
          }
        }
      }
    }, signal);
  }
  signal?.throwIfAborted();
  return names.flatMap((spec) => { const value = readDesignerFaGeometry(port, spec); return value ? [value] : []; });
}
