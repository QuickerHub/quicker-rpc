/** Omission inherits; an explicit empty restriction stays empty through composition. */
export function mergeToolRestrictions(
  baseEnabled: string[] | undefined,
  allowedTools: string[] | undefined,
): string[] | undefined {
  if (allowedTools === undefined) return baseEnabled;
  if (baseEnabled === undefined) return [...allowedTools];
  const allowed = new Set(allowedTools);
  return baseEnabled.filter((id) => allowed.has(id));
}
