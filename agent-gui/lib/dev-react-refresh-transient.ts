/** Fast Refresh partial updates — not representative of a clean page load. */
export function isReactRefreshTransientError(parts: {
  message?: string;
  stack?: string;
}): boolean {
  const stack = parts.stack ?? "";
  return (
    stack.includes("performReactRefresh")
    || stack.includes("react-refresh-runtime")
    || stack.includes("@next/react-refresh-utils")
  );
}
