/** A bounded copy of gateway guide observations, never native editing authority. */
export const GATEWAY_GUIDE_PROJECTION_MAX_CHARS = 3 * 1024;
const NOTICE = "Observed gateway codec and bundled-guide metadata only, not native support or write permission. Omitted values are unknown; identities are never shortened. Full guide data remains in the display result.";
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function projectGatewayGuideKnowledge(output: unknown): Record<string, unknown> | undefined {
  const root = record(output), data = record(root?.data);
  if (!data) return;
  const previous = record(data.gatewayKnowledgeProjection);
  const isPrevious = previous?.guideSource === "gateway";
  if (data.guideSource !== "gateway" && !isPrevious) return;
  const candidate = record(data.gatewayKnowledge) ?? (isPrevious ? record(previous.gatewayKnowledge) : undefined);
  const omitted = new Set<string>();
  if (isPrevious && previous.metadataStatus === "partial") omitted.add("previously omitted metadata");
  const copied: Record<string, unknown> = {};
  const leaves: Array<{ target: Record<string, unknown>; key: string; path: string }> = [];
  const copy = (source: Record<string, unknown>, target: Record<string, unknown>, key: string, path: string) => {
    if (!Object.hasOwn(source, key)) return;
    const value = source[key];
    const scalar = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
    if (!(scalar(value) || (Array.isArray(value) && value.length <= 16 && value.every(scalar))) || JSON.stringify(value).length > 512) {
      omitted.add(path); return;
    }
    target[key] = value; leaves.push({ target, key, path });
  };
  const group = (source: Record<string, unknown>, target: Record<string, unknown>, name: string, fields: string[], nested: Record<string, string[]> = {}, prefix = "") => {
    if (!Object.hasOwn(source, name)) return;
    const path = prefix + name;
    if (source[name] === null) { copy(source, target, name, path); return; }
    const value = record(source[name]);
    if (!value) { omitted.add(path); return; }
    const dest: Record<string, unknown> = {}; target[name] = dest;
    for (const field of fields) copy(value, dest, field, `${path}.${field}`);
    for (const [key, keys] of Object.entries(nested)) group(value, dest, key, keys, {}, `${path}.`);
    if (Object.keys(value).some(key => !fields.includes(key) && !Object.hasOwn(nested, key))) omitted.add(`${path}.additionalFields`);
  };
  if (candidate) {
    // Capture exact provider identity first; budget pressure removes later leaves first.
    group(candidate, copied, "gateway", ["transport", "identity", "displayName"]);
    copy(candidate, copied, "status", "status"); copy(candidate, copied, "retrievedAt", "retrievedAt");
    group(candidate, copied, "codec", ["schemaVersion", "descriptorRevision"], {
      source: ["provider", "kind", "assemblyName", "assemblyVersion", "informationalVersion", "moduleVersionId", "identityStatus"],
      formats: ["inputs", "output", "omittedInput"], nativeSource: ["status", "read", "write"],
    });
    group(candidate, copied, "provenance", ["schemaVersion", "indexRevision", "contentRevision"], {
      source: ["provider", "kind", "assemblyName", "bundleVersion"],
    });
    copy(candidate, copied, "reason", "reason");
    if (Object.keys(candidate).some(key => !["gateway", "status", "retrievedAt", "codec", "provenance", "reason"].includes(key))) omitted.add("additionalFields");
  }
  const failed = root?.ok !== true || data.success === false;
  if (failed) { copied.status = "unavailable"; copied.codec = null; copied.provenance = null; }
  const build = () => ({ guideSource: "gateway", metadataStatus: failed || candidate?.status !== "available" || (isPrevious && previous.metadataStatus === "unknown") ? "unknown" : omitted.size ? "partial" : "preserved",
    gatewayKnowledge: copied, ...(omitted.size ? { omittedFields: [...omitted] } : {}), notice: NOTICE });
  let result = build();
  while (JSON.stringify(result).length > GATEWAY_GUIDE_PROJECTION_MAX_CHARS && leaves.length) {
    const leaf = leaves.pop()!; delete leaf.target[leaf.key]; omitted.add(leaf.path); result = build();
  }
  return result;
}
