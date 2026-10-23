import { getRequestAbortSignal } from "@/lib/qkrpc-request-context";

/** An adapter's explicit signal may narrow cancellation, never replace the owning turn. */
export function resolveRequestAbortSignal(explicit?: AbortSignal): AbortSignal | undefined {
  const parent = getRequestAbortSignal();
  return parent && explicit && parent !== explicit
    ? AbortSignal.any([parent, explicit])
    : explicit ?? parent;
}
