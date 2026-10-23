import type { ToolboxDragPayload } from "../steps/toolboxStepFactory";

export type ToolboxInsertHandler = (payload: ToolboxDragPayload) => void | Promise<void>;
export type RegisterToolboxInsert = (handler: ToolboxInsertHandler) => () => void;

/** Owned by one workspace. A departing/inactive surface cannot clear another surface's handler. */
export function createToolboxInsertionRegistry() {
  const handlers = new Map<string, ToolboxInsertHandler>();
  return {
    register(surface: string, handler: ToolboxInsertHandler): () => void {
      handlers.set(surface, handler);
      return () => { if (handlers.get(surface) === handler) handlers.delete(surface); };
    },
    async request(surface: string, payload: ToolboxDragPayload): Promise<void> {
      await handlers.get(surface)?.(payload);
    },
  };
}
