import { formatLlmSelection, type LlmSelection } from "@/lib/llm-selection";
import { parseLlmProviderId, type LlmProviderId } from "@/lib/llm-providers";

type SelectionResolver = (
  rawSelection?: string,
  legacyProvider?: LlmProviderId,
) => LlmSelection;

/** Resolve once, then serialize that exact selection for nested tool runtimes. */
export function resolveEffectiveTurnSelection(
  input: { llmSelection?: string; llmProvider?: string; commandModelOverride?: string },
  resolveSelection: SelectionResolver,
): { selection: LlmSelection; llmSelectionRaw: string } {
  const selection = resolveSelection(
    input.commandModelOverride ?? input.llmSelection ?? input.llmProvider,
    parseLlmProviderId(input.llmProvider),
  );
  return { selection, llmSelectionRaw: formatLlmSelection(selection) };
}
