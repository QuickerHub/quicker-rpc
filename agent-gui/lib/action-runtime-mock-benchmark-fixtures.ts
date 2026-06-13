/**
 * Known action ids from SDK L2 retro runs (2026-06-13). Override in /tool-test UI.
 */
export const ACTION_RUNTIME_MOCK_BENCHMARK_ACTION_IDS: Readonly<
  Record<string, string>
> = {
  "clip-lines-expr": "65a3b800-f5be-4a2b-ac03-5c9a27f4e71d",
  "multi-var-assign": "b63593ce-d494-40f9-a87e-18011c443d28",
  "http-json-origin": "3a59e44b-01f2-4ae1-b50a-97a6b147212f",
  "window-vscode-branch": "f3b993a2-594b-4109-b714-25e1470a72a9",
  "form-to-clipboard": "9441be78-167e-4434-a46b-5a87f23b2a35",
  "file-copy-timestamp": "3dacfbea-37f9-4777-bcdf-e9a816a9238d",
};

export function resolveBenchmarkMockActionId(taskId: string): string {
  return ACTION_RUNTIME_MOCK_BENCHMARK_ACTION_IDS[taskId] ?? "";
}
