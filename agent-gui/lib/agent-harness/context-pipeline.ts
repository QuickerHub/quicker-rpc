import {
  prepareCompressedContext,
  type PrepareCompressedContextOptions,
} from "@/lib/context-compression";
import { applySlidingWindowTrim } from "./sliding-window-trim";
import type { PreparedModelContext } from "./types";

export type PrepareContextPipelineOptions = PrepareCompressedContextOptions;

/** Model-facing context: L2 compression + sliding-window trim (does not mutate persisted UI messages). */
export async function prepareContextPipeline(
  options: PrepareContextPipelineOptions,
): Promise<PreparedModelContext> {
  const prepared = await prepareCompressedContext(options);
  const trimmed = applySlidingWindowTrim(prepared.modelMessages);

  return {
    ...prepared,
    modelMessages: trimmed.messages,
    slidingWindowApplied: trimmed.applied,
  };
}
