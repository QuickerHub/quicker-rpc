import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import {
  CURSOR_SDK_MODEL_OPTIONS,
  defaultCursorSdkModelId,
  resolveCursorSdkApiKey,
} from "@/lib/cursor-sdk/config.server";
import { cursorSdkDevOnlyResponse } from "@/lib/cursor-sdk/dev-guard.server";
import { fetchCursorSdkRuntimeJson } from "@/lib/cursor-sdk-runtime-client.server";

export const dynamic = "force-dynamic";

type RuntimeStatus = {
  configured?: boolean;
  defaultModel?: string;
  remoteModels?: Array<{ id: string; label: string }>;
  qkrpcExe?: string | null;
  qkrpcError?: string | null;
  activeSessions?: number;
};

export async function GET() {
  const blocked = cursorSdkDevOnlyResponse();
  if (blocked) return blocked;

  const apiKey = resolveCursorSdkApiKey();
  const cwd = resolveEffectiveWorkingDirectory();

  if (!apiKey) {
    return Response.json({
      configured: false,
      defaultModel: defaultCursorSdkModelId(),
      builtinModels: CURSOR_SDK_MODEL_OPTIONS,
      remoteModels: undefined,
      workingDirectory: cwd,
      qkrpcExe: null,
      qkrpcError: null,
      activeSessions: 0,
    });
  }

  try {
    const runtime = await fetchCursorSdkRuntimeJson<RuntimeStatus>("/v1/status");
    return Response.json({
      configured: runtime.configured ?? true,
      defaultModel: runtime.defaultModel ?? defaultCursorSdkModelId(),
      builtinModels: CURSOR_SDK_MODEL_OPTIONS,
      remoteModels: runtime.remoteModels,
      workingDirectory: cwd,
      qkrpcExe: runtime.qkrpcExe ?? null,
      qkrpcError: runtime.qkrpcError ?? null,
      activeSessions: runtime.activeSessions ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({
      configured: true,
      defaultModel: defaultCursorSdkModelId(),
      builtinModels: CURSOR_SDK_MODEL_OPTIONS,
      remoteModels: undefined,
      workingDirectory: cwd,
      qkrpcExe: null,
      qkrpcError: message,
      activeSessions: 0,
      runtimeError: message,
    });
  }
}
