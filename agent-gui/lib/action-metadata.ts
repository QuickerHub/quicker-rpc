export type ActionMetadata = {
  id?: string;
  title?: string;
  description?: string;
  icon?: string;
};

const METADATA_KEYS = new Set([
  "id",
  "actionid",
  "title",
  "name",
  "description",
  "icon",
]);

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

export function parseActionMetadata(value: unknown): ActionMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const id = readString(obj, "id", "actionId", "Id", "ActionId");
  const title = readString(obj, "title", "Title", "name", "Name");
  const description = readString(obj, "description", "Description");
  const icon = readString(obj, "icon", "Icon");

  if (!id && !title && !description && !icon) return null;
  if (!title && !description && !icon) return null;

  return { id, title, description, icon };
}

export function splitActionMetadataFields(
  value: unknown,
): { meta: ActionMetadata | null; rest: Record<string, unknown> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { meta: null, rest: {} };
  }
  const obj = value as Record<string, unknown>;
  const meta = parseActionMetadata(obj);
  const rest: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (METADATA_KEYS.has(key.toLowerCase())) continue;
    rest[key] = val;
  }
  return { meta, rest };
}

export function formatActionMetadataMetaLine(meta: ActionMetadata): string {
  if (meta.title) return meta.title;
  if (meta.id) return `动作 ${meta.id.slice(0, 8)}…`;
  return "动作元数据";
}

export function isActionMetadataTool(toolName: string): boolean {
  return (
    toolName === "qkrpc_action_create"
    || toolName === "qkrpc_action_set_metadata"
  );
}
