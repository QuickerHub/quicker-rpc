/** Match C# LocalTimeDisplay — format last-edit for action list UI. */

const OFFSET_SUFFIX = /[+-]\d{2}:\d{2}(:\d{2})?$/;

export function normalizeUtcIso(utcIso: string): string {
  const trimmed = utcIso.trim();
  if (!trimmed) return "";
  if (/[zZ]$/.test(trimmed)) return trimmed;
  if (OFFSET_SUFFIX.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
}

function parseUtcToDate(utc: unknown): Date | null {
  if (utc == null) return null;

  if (typeof utc === "object") {
    const t = utc as { seconds?: bigint | number | string; nanos?: number };
    if ("seconds" in t) {
      const sec = Number(t.seconds ?? 0);
      const ms = sec * 1000 + Number(t.nanos ?? 0) / 1e6;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  if (typeof utc === "string" && utc.trim()) {
    const d = new Date(normalizeUtcIso(utc));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatUtcAsLocalLabel(utc: unknown): string | undefined {
  const d = parseUtcToDate(utc);
  if (!d) return undefined;

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDay.getTime()) / 86_400_000,
  );
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  if (dayDiff === 0) return `今天 ${hm}`;
  if (dayDiff === 1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

/** Prefer server lastEditTimeLocal; else derive from lastEditTimeUtc. */
export function formatLastEditDisplay(
  lastEditTimeLocal?: string,
  lastEditTimeUtc?: unknown,
): string | undefined {
  const local = lastEditTimeLocal?.trim();
  if (local) return local;
  return formatUtcAsLocalLabel(lastEditTimeUtc);
}
