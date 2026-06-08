import { CUSTOM_PROVIDER_ID, parseLlmProviderId } from "@/lib/llm-providers";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { isUserModelSelectorProvider } from "@/lib/llm-user-providers";
import {
  buildLlmOptionsResponse,
  findLlmModelOption,
  type LlmOptionsResponse,
} from "@/lib/llm-options";
import {
  isLlmSelectionConfigured,
  resolveLlmConfig,
  resolveLlmSelection,
} from "@/lib/llm";
import { LLM_AUTO_DEFAULT_MODEL_ID } from "@/lib/llm-auto";
import { parseLlmSelection } from "@/lib/llm-selection";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return withReleasePreviewRoute(async () => {
    const snapshot = buildLlmOptionsResponse();
    return Response.json(snapshot satisfies LlmOptionsResponse);
  });
}

export async function POST(req: Request) {
  return withReleasePreviewRoute(async () => {
    const body = (await req.json()) as {
      provider?: string;
      selection?: string;
    };

    const selection = resolveLlmSelection(
      body.selection ?? body.provider,
      parseLlmProviderId(body.provider),
    );

    if (selection.kind === "builtin") {
      if (
        !isUserModelSelectorProvider(selection.providerId)
        || isLlmProviderHidden(selection.providerId)
      ) {
        return Response.json(
          { error: `Provider "${selection.providerId}" is not available` },
          { status: 400 },
        );
      }
    }

    if (!isLlmSelectionConfigured(selection)) {
      return Response.json(
        { error: "Model selection is not configured" },
        { status: 400 },
      );
    }

    try {
      const config = selection.kind === "auto"
        ? (() => {
          const snapshot = buildLlmOptionsResponse();
          const key = body.selection ?? body.provider;
          const opt = key ? findLlmModelOption(snapshot.options, key) : undefined;
          return {
            providerId: CUSTOM_PROVIDER_ID,
            modelId: opt?.modelId ?? LLM_AUTO_DEFAULT_MODEL_ID,
            contextLimit: opt?.contextLimit
              ?? resolveModelContextLimit(
                opt?.modelId ?? LLM_AUTO_DEFAULT_MODEL_ID,
                CUSTOM_PROVIDER_ID,
              ).tokens,
          };
        })()
        : selection.kind === "profile"
        ? (() => {
          const snapshot = buildLlmOptionsResponse();
          const key = body.selection ?? body.provider;
          const opt = key ? findLlmModelOption(snapshot.options, key) : undefined;
          return {
            providerId: CUSTOM_PROVIDER_ID,
            modelId: selection.modelId,
            contextLimit: opt?.contextLimit
              ?? resolveModelContextLimit(selection.modelId, CUSTOM_PROVIDER_ID).tokens,
          };
        })()
        : resolveLlmConfig(selection.providerId);

      return Response.json({
        selection: body.selection ?? body.provider,
        providerId: config.providerId,
        modelId: config.modelId,
        contextLimit: "contextLimit" in config
          ? config.contextLimit
          : resolveModelContextLimit(config.modelId, config.providerId).tokens,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
  });
}
