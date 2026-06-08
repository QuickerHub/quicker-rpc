export const LLM_KEYS_UPDATED_EVENT = "agent-gui:llm-keys-updated";

export type LlmKeysUpdatedDetail = {
  /** Sticky builtin endpoint only — settings panel keeps existing probe results. */
  stickyEndpointOnly?: boolean;
};

export function dispatchLlmKeysUpdated(detail?: LlmKeysUpdatedDetail): void {
  window.dispatchEvent(
    new CustomEvent<LlmKeysUpdatedDetail>(LLM_KEYS_UPDATED_EVENT, {
      detail: detail ?? {},
    }),
  );
}
