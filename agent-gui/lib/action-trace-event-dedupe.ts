import type { ActionTraceEvent } from "./action-trace-format";

/** Exact recent duplicates only. Eviction may show an old duplicate, never discard a distinct event. */
export function createTraceEventDedupe(maxBytes = 2_000_000, maxEntries = 4096) {
  const identities = new Map<string, number>();
  let bytes = 0;
  return {
    accept(event: ActionTraceEvent): boolean {
      if (event.sequence === undefined) return true;
      const identity = `${event.sequence}:${JSON.stringify(event)}`;
      if (identities.has(identity)) return false;
      const size = identity.length * 2;
      if (size > maxBytes) return true;
      while (identities.size && (bytes + size > maxBytes || identities.size >= maxEntries)) {
        const [key, length] = identities.entries().next().value!;
        identities.delete(key);
        bytes -= length;
      }
      identities.set(identity, size);
      bytes += size;
      return true;
    },
    clear() { identities.clear(); bytes = 0; },
    retainedBytes() { return bytes; },
    retainedEntries() { return identities.size; },
  };
}
