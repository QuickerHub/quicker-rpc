import { readHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";

export const ACTION_PROJECT_BINDING_PATH = ".qkrpc/project-binding.json";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type ActionProjectBinding = {
  schemaVersion: 1;
  kind: "action";
  actionId: string;
  hostBinding: QkrpcHostBinding;
};

export class ActionProjectBindingError extends Error {
  constructor(readonly code: string, message: string, readonly persistedParts?: { localProject?: boolean; binding?: boolean }) {
    super(`${code}: ${message}`);
  }
}

export function parseActionProjectBinding(value: unknown, actionId: string): ActionProjectBinding {
  const record = value as Partial<ActionProjectBinding> | null;
  const binding = readHostBinding(record?.hostBinding);
  if (!record || record.schemaVersion !== 1 || record.kind !== "action" || typeof record.actionId !== "string"
    || !uuid.test(record.actionId) || !binding) {
    throw new ActionProjectBindingError("HOST_HANDSHAKE_INVALID", "Project binding is invalid.");
  }
  if (record.actionId.toLowerCase() !== actionId.toLowerCase()) {
    throw new ActionProjectBindingError("HOST_BINDING_MISMATCH", "Project binding belongs to another action.");
  }
  return { schemaVersion: 1, kind: "action", actionId: record.actionId, hostBinding: binding };
}

/** Document identity includes the complete persisted binding, independent of JSON property order. */
export function fingerprintActionProjectBinding(record: ActionProjectBinding): string {
  return JSON.stringify({ schemaVersion: record.schemaVersion, kind: record.kind, actionId: record.actionId.toLowerCase(), hostBinding: record.hostBinding },
    (_key, value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    });
}

export function sameActionProjectBinding(a: ActionProjectBinding, b: ActionProjectBinding): boolean {
  return fingerprintActionProjectBinding(a) === fingerprintActionProjectBinding(b);
}
