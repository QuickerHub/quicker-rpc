const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function tryFetchText(primary, mirror) {
  const primaryText = await fetchText(primary);
  if (primaryText) return primaryText;
  if (mirror) {
    return fetchText(mirror);
  }
  return null;
}
