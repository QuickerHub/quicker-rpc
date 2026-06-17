import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { extractLastUserMessageText } from "@/lib/launcher/launcher-command-cache.server";
import {
  CURSOR_SDK_DEFAULT_MODEL,
  defaultCursorSdkModelId,
  resolveCursorSdkApiKey,
} from "@/lib/cursor-sdk/config.server";
import { cursorSdkDevOnlyResponse } from "@/lib/cursor-sdk/dev-guard.server";
import { postCursorSdkRuntimeChat } from "@/lib/cursor-sdk-runtime-client.server";
import { streamCursorSdkNdjsonResponseToWriter } from "@/lib/cursor-sdk/stream-bridge.server";

export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = cursorSdkDevOnlyResponse();
  if (blocked) return blocked;

  try {
    if (!resolveCursorSdkApiKey()) {
      return Response.json(
        { error: "CURSOR_API_KEY is not configured on the server." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      messages: AgentUIMessage[];
      sessionId?: string;
      workingDirectory?: string;
      model?: string;
      newSession?: boolean;
    };

    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }

    const prompt = extractLastUserMessageText(body.messages ?? []).trim();
    if (!prompt) {
      return Response.json({ error: "Empty user message" }, { status: 400 });
    }

    const cwd = resolveEffectiveWorkingDirectory(body.workingDirectory);
    const modelId = body.model?.trim() || defaultCursorSdkModelId();

    const stream = createUIMessageStream<AgentUIMessage>({
      originalMessages: body.messages ?? [],
      execute: async ({ writer }) => {
        try {
          const runtimeResponse = await postCursorSdkRuntimeChat({
            sessionId,
            prompt,
            cwd,
            model: modelId,
            newSession: body.newSession === true,
          });
          const outcome = await streamCursorSdkNdjsonResponseToWriter(writer, {
            response: runtimeResponse,
            modelId,
          });
          if (outcome.status !== "finished" && outcome.resultText) {
            writer.write({
              type: "error",
              errorText: outcome.resultText,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writer.write({ type: "error", errorText: message });
          writer.write({
            type: "finish",
            finishReason: "error",
            messageMetadata: { model: modelId },
          });
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "X-Cursor-Sdk-Model": modelId || CURSOR_SDK_DEFAULT_MODEL,
      },
    });
  } catch (e) {
    console.error("[/api/cursor-sdk/chat]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
