/** Metadata copied from a StepRunner result; this projection never authorizes editing. */
export type StepRunnerKnowledgeProjection = {
  schemaComplete: false;
  metadataStatus: "preserved" | "partial" | "unknown";
  knowledge?: Record<string, unknown>;
  omittedFields?: string[];
  notice: string;
};

export const KNOWLEDGE_PROJECTION_MAX_CHARS = 3 * 1024;
const FIELD_MAX_CHARS = 512;
const NOTICE = "Schema is incomplete, not an editing contract. Preserved describes metadata only, not native support or freshness. An identical get does not recover omitted schema.";
const SOURCE_FIELDS = ["provider", "kind", "hostKind", "quickerVersion", "adapterAssembly", "adapterVersion", "hostInstanceId", "hostSessionId", "endpoint"];
const SCHEMA_FIELDS = ["format", "revision"];
const REFERENCE_FIELDS = ["source", "bundleVersion", "indexRevision"];
const ROOT_FIELDS = ["schemaVersion", "source", "schema", "requestedControlFieldValue", "retrievedAt", "nativeHelpLink", "bundledReference"];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Only current model data is inspected. displayData may contain an older/full result. */
export function projectStepRunnerKnowledge(output: unknown): StepRunnerKnowledgeProjection | undefined {
  const root = record(output);
  const data = record(root?.data);
  if (!root || !data) return;
  const previous = record(data.knowledgeProjection);
  const isPrevious = previous?.schemaComplete === false && ["preserved", "partial", "unknown"].includes(String(previous.metadataStatus));
  if ((data.action ?? data.Action) !== "step-runner-get" && !isPrevious) return;
  const payload = record(data.payload ?? data.Payload) ?? data;
  const failed = root.ok !== true || data.ok === false || data.success === false || payload.ok === false || payload.success === false || payload.Success === false;
  if (failed) return { schemaComplete: false, metadataStatus: "unknown", notice: `The read was unsuccessful; metadata cannot prove a current definition. ${NOTICE}` };

  let schema = record(payload.schema);
  if (!schema) {
    const schemaJson = payload.schemaJson ?? payload.SchemaJson;
    if (typeof schemaJson === "string") {
      try { schema = record(JSON.parse(schemaJson)); } catch { /* Malformed schema is not provenance. */ }
    }
  }
  const candidate = record(schema?.knowledge) ?? record(payload.knowledge) ?? (isPrevious ? record(previous!.knowledge) : undefined);
  if (!candidate) return { schemaComplete: false, metadataStatus: "unknown", notice: NOTICE };

  const omitted = new Set<string>();
  if (isPrevious && previous!.metadataStatus === "partial") omitted.add("previously omitted metadata");
  const copied: Record<string, unknown> = {};
  const leaves: { target: Record<string, unknown>; key: string; path: string }[] = [];
  const copy = (source: Record<string, unknown>, target: Record<string, unknown>, key: string, path: string) => {
    if (!Object.hasOwn(source, key)) return;
    const value = source[key];
    const scalar = value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
    if (!scalar || JSON.stringify(value).length > FIELD_MAX_CHARS) { omitted.add(path); return; }
    target[key] = value;
    leaves.push({ target, key, path });
  };
  const group = (name: string, fields: string[]) => {
    if (!Object.hasOwn(candidate, name)) return;
    const source = record(candidate[name]);
    if (!source) { omitted.add(name); return; }
    const target: Record<string, unknown> = {};
    copied[name] = target;
    for (const key of fields) copy(source, target, key, `${name}.${key}`);
    if (Object.keys(source).some(key => !fields.includes(key))) omitted.add(`${name}.additionalFields`);
  };
  // Preserve exact values, including null, empty, false and zero; never truncate an identity.
  copy(candidate, copied, "schemaVersion", "schemaVersion");
  group("source", SOURCE_FIELDS);
  group("schema", SCHEMA_FIELDS);
  copy(candidate, copied, "requestedControlFieldValue", "requestedControlFieldValue");
  copy(candidate, copied, "retrievedAt", "retrievedAt");
  copy(candidate, copied, "nativeHelpLink", "nativeHelpLink");
  group("bundledReference", REFERENCE_FIELDS);
  if (Object.keys(candidate).some(key => !ROOT_FIELDS.includes(key))) omitted.add("additionalFields");

  const source = record(copied.source);
  const knownSource = copied.schemaVersion === 1 && source?.provider === "qkrpc.step-runner"
    && ["runtime-definition", "bundled-adapter"].includes(String(source.kind));
  const build = (): StepRunnerKnowledgeProjection => ({
    schemaComplete: false,
    metadataStatus: !knownSource || (isPrevious && previous!.metadataStatus === "unknown") ? "unknown" : omitted.size ? "partial" : "preserved",
    knowledge: copied,
    ...(omitted.size ? { omittedFields: [...omitted] } : {}),
    notice: NOTICE,
  });
  let result = build();
  while (JSON.stringify(result).length > KNOWLEDGE_PROJECTION_MAX_CHARS && leaves.length) {
    const leaf = leaves.pop()!;
    delete leaf.target[leaf.key];
    omitted.add(leaf.path);
    result = build();
  }
  return result;
}
