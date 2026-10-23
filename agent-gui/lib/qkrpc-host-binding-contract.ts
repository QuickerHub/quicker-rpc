export type QkrpcHostBinding = Readonly<{
  hostInstanceId: string;
  hostSessionId: string;
  endpoint: string;
  protocolVersion: number;
  schemaVersion: number;
  hostKind: "v1" | "v2";
  quickerVersion: string;
  capabilities: Readonly<Record<string, boolean>>;
}>;

/** Transport target equality deliberately uses the existing three identity fields. */
export function sameHostBinding(a: QkrpcHostBinding, b: QkrpcHostBinding): boolean {
  return a.hostInstanceId === b.hostInstanceId && a.hostSessionId === b.hostSessionId && a.endpoint === b.endpoint;
}

export function readHostBinding(value: unknown): QkrpcHostBinding | undefined {
  if (!value || typeof value !== "object") return;
  const b = value as Record<string, unknown>;
  if (typeof b.hostInstanceId !== "string" || !b.hostInstanceId || typeof b.hostSessionId !== "string"
    || !/^[a-f0-9]{32}$/i.test(b.hostSessionId) || typeof b.endpoint !== "string"
    || !/^QuickerRpc_User_[A-F0-9]{24}_[a-f0-9]{32}$/i.test(b.endpoint)
    || !b.endpoint.endsWith(`_${b.hostSessionId}`) || b.protocolVersion !== 1 || b.schemaVersion !== 1
    || (b.hostKind !== "v1" && b.hostKind !== "v2") || !b.capabilities || typeof b.capabilities !== "object"
    || Array.isArray(b.capabilities) || Object.values(b.capabilities).some((v) => typeof v !== "boolean")) return;
  return Object.freeze({ ...b, capabilities: Object.freeze({ ...b.capabilities }) }) as QkrpcHostBinding;
}
