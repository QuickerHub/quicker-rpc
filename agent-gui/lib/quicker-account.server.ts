import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export type QuickerAccountSnapshot = {
  loggedIn: boolean;
  userId?: string;
  message?: string;
};

type QuickerAccountRpcPayload = {
  ok?: boolean;
  loggedIn?: boolean;
  userId?: string;
  message?: string;
};

let cachedAccount: { at: number; value: QuickerAccountSnapshot } | null = null;
const CACHE_TTL_MS = 30_000;

function normalizeAccountPayload(
  payload: QuickerAccountRpcPayload | null,
): QuickerAccountSnapshot {
  if (!payload?.ok) {
    return {
      loggedIn: false,
      message: "Quicker account lookup failed.",
    };
  }
  const userId = payload.userId?.trim();
  const loggedIn = payload.loggedIn === true && Boolean(userId);
  return {
    loggedIn,
    userId: loggedIn ? userId : undefined,
    message: payload.message?.trim() || undefined,
  };
}

export async function fetchQuickerAccount(options?: {
  forceRefresh?: boolean;
}): Promise<QuickerAccountSnapshot> {
  const forceRefresh = options?.forceRefresh === true;
  if (
    !forceRefresh
    && cachedAccount
    && Date.now() - cachedAccount.at < CACHE_TTL_MS
  ) {
    return cachedAccount.value;
  }

  const result = await invokeQkrpcHttp(
    { op: "quicker.account.get", args: {} },
    { timeoutMs: 8_000 },
  );
  if (!result?.ok) {
    const snapshot: QuickerAccountSnapshot = {
      loggedIn: false,
      message: result?.stderr?.trim() || "Quicker RPC unavailable.",
    };
    cachedAccount = { at: Date.now(), value: snapshot };
    return snapshot;
  }

  let payload: QuickerAccountRpcPayload | null = null;
  try {
    payload = JSON.parse(result.stdout) as QuickerAccountRpcPayload;
  } catch {
    payload = null;
  }

  const snapshot = normalizeAccountPayload(payload);
  cachedAccount = { at: Date.now(), value: snapshot };
  return snapshot;
}
