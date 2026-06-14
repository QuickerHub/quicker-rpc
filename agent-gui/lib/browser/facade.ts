import { invokeBrowserRuntime } from "@/lib/browser-runtime-client.server";
import {
  invokeEmbeddedBrowserRuntime,
  isEmbeddedBrowserRuntimeAvailable,
  shouldFallbackToPlaywrightBrowserResult,
} from "@/lib/embedded-browser-runtime-client.server";
import { isNativeEmbeddedBrowserEnabled } from "@/lib/browser-native-mode";
import { opForBrowserAction, SESSION_ENSURE_ACTIONS } from "@/lib/browser/ops";
import { resolveBrowserTarget } from "@/lib/browser/resolve-target";
import type { BrowserRuntimeMode, ExecuteBrowserAutomationOptions } from "@/lib/browser/types";
import {
  sanitizeBrowserToolDataForAgent,
  type BrowserToolAudience,
} from "@/lib/browser-tool-result";
import { normalizeEmbeddedBrowserUrl } from "@/lib/embedded-browser-url";
import { formatLocalToolResult } from "@/lib/tool-result";
import type { BrowserToolInput } from "@/lib/browser/input-types";

function sessionId(input: BrowserToolInput): string {
  return input.sessionId?.trim() || "default";
}

function runtimeModeLabel(mode: BrowserRuntimeMode): BrowserRuntimeMode {
  return mode;
}

function shouldFallbackToPlaywrightFromNativeToolResult(
  result: Record<string, unknown>,
): boolean {
  if (result.ok === true) return false;
  const stderr = String(result.stderr ?? "");
  const data =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : {};
  return (
    shouldFallbackToPlaywrightBrowserResult({
      ok: false,
      message: stderr,
      error: typeof data.op === "string" ? data.op : undefined,
    })
    || stderr.toLowerCase().includes("embedded browser session not ready")
  );
}

function panelSyncFlags(
  audience: BrowserToolAudience,
  mode: BrowserRuntimeMode,
  showPanel?: boolean,
): { background?: boolean; showPanel?: boolean; panelSync?: boolean } {
  if (audience === "panel") {
    return { panelSync: true };
  }
  if (mode === "headless") {
    return { background: true };
  }
  if (showPanel === true) {
    return { showPanel: true };
  }
  return {};
}

async function executeEmbeddedBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserAutomationOptions,
): Promise<Record<string, unknown>> {
  const audience = options?.audience ?? "agent";
  const showPanel = options?.showPanel ?? input.showPanel;
  const sid = sessionId(input);

  if (audience === "agent" && input.action === "screenshot") {
    return formatLocalToolResult(
      null,
      false,
      "screenshot is not available to the agent; use snapshot or content. Side panel shows live preview.",
    );
  }

  if (audience === "agent" && input.action === "pick_element") {
    return formatLocalToolResult(
      null,
      false,
      "pick_element is panel-only; user picks elements in the side-panel browser UI.",
    );
  }

  if (input.action === "navigate") {
    if (!input.url?.trim()) {
      return formatLocalToolResult(null, false, "url is required for navigate");
    }
    const normalized = normalizeEmbeddedBrowserUrl(input.url);
    if (!normalized) {
      return formatLocalToolResult(null, false, "url is invalid");
    }
    input = { ...input, url: normalized };
  }

  if (input.action === "click_xy" || input.action === "pick_element") {
    if (input.x == null || input.y == null) {
      return formatLocalToolResult(
        null,
        false,
        `x and y are required for ${input.action}`,
      );
    }
  }

  if (input.action === "evaluate" && !input.script?.trim()) {
    return formatLocalToolResult(null, false, "script is required for evaluate");
  }

  if (input.action === "search" && !input.text?.trim()) {
    return formatLocalToolResult(null, false, "text is required for search (page text query)");
  }

  if (input.action === "tab" && (input.index == null || input.index < 0)) {
    return formatLocalToolResult(
      null,
      false,
      "index is required for tab (use action=tabs to list open tabs)",
    );
  }

  const op =
    input.action === "status"
      ? "status"
      : input.action === "close"
        ? "session.close"
        : opForBrowserAction(input.action);

  if (SESSION_ENSURE_ACTIONS.has(input.action) && input.action !== "navigate") {
    const ensured = await invokeEmbeddedBrowserRuntime("session.ensure", {}, sid, 60_000);
    if (!ensured.ok) {
      return formatLocalToolResult(
        {
          action: input.action,
          sessionId: sid,
          op: "session.ensure",
          mode: "embedded",
        },
        false,
        ensured.message ?? ensured.error ?? "embedded browser session not ready",
      );
    }
  }

  const args: Record<string, unknown> = {};
  if (input.url) args.url = input.url;
  if (input.ref) args.ref = input.ref;
  if (input.x != null) args.x = input.x;
  if (input.y != null) args.y = input.y;
  if (input.text != null) args.text = input.text;
  if (input.value != null) args.value = input.value;
  if (input.key) args.key = input.key;
  if (input.waitUntil) args.waitUntil = input.waitUntil;
  if (input.timeoutMs != null) args.timeoutMs = input.timeoutMs;
  if (input.fullPage != null) args.fullPage = input.fullPage;
  if (input.state) args.state = input.state;
  if (input.delayMs != null) args.delayMs = input.delayMs;
  if (input.deltaX != null) args.deltaX = input.deltaX;
  if (input.deltaY != null) args.deltaY = input.deltaY;
  if (input.script) args.script = input.script;
  if (input.selector?.trim()) args.selector = input.selector.trim();
  if (input.offset != null) args.offset = input.offset;
  if (input.index != null) args.index = input.index;
  if (input.limit != null) args.limit = input.limit;
  args.includePreview = audience === "panel";

  const result = await invokeEmbeddedBrowserRuntime(
    op,
    args,
    sid,
    input.timeoutMs ?? 120_000,
  );

  if (!result.ok) {
    if (input.action === "navigate" && input.url) {
      return formatLocalToolResult({
        action: "navigate",
        sessionId: sid,
        url: input.url,
        title: "",
        mode: "embedded",
        deferred: true,
        message:
          result.message
          ?? "Side panel will open the page; retry snapshot/evaluate after the view mounts.",
      });
    }
    return formatLocalToolResult(
      { action: input.action, sessionId: sid, op, mode: "embedded" },
      false,
      result.message ?? result.error ?? "embedded browser invoke failed",
    );
  }

  const runtimeData =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data };

  const payload: Record<string, unknown> = {
    action: input.action,
    sessionId: sid,
    mode: runtimeModeLabel("embedded"),
    ...panelSyncFlags(audience, "embedded", showPanel),
    ...(options?.fallbackFromNative ? { fallbackFromNative: true } : {}),
    ...runtimeData,
  };

  if (input.action === "navigate" && input.url && !payload.url) {
    payload.url = input.url;
  }

  const data =
    audience === "agent" ? sanitizeBrowserToolDataForAgent(payload) : payload;

  return formatLocalToolResult(data);
}

async function executeHeadlessBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserAutomationOptions,
): Promise<Record<string, unknown>> {
  const audience = options?.audience ?? "agent";
  const sid = sessionId(input);

  if (audience === "agent" && input.action === "screenshot") {
    return formatLocalToolResult(
      null,
      false,
      "screenshot is not available to the agent; use snapshot or content. Side panel shows live preview.",
    );
  }

  if (audience === "agent" && input.action === "pick_element") {
    return formatLocalToolResult(
      null,
      false,
      "pick_element is panel-only; user picks elements in the side-panel browser UI.",
    );
  }

  if (input.action === "navigate") {
    if (!input.url?.trim()) {
      return formatLocalToolResult(null, false, "url is required for navigate");
    }
  }

  if (input.action === "click_xy" || input.action === "pick_element") {
    if (input.x == null || input.y == null) {
      return formatLocalToolResult(
        null,
        false,
        `x and y are required for ${input.action}`,
      );
    }
  }

  if (input.action === "evaluate" && !input.script?.trim()) {
    return formatLocalToolResult(null, false, "script is required for evaluate");
  }

  if (input.action === "search" && !input.text?.trim()) {
    return formatLocalToolResult(null, false, "text is required for search (page text query)");
  }

  if (input.url?.trim()) {
    const normalized = normalizeEmbeddedBrowserUrl(input.url);
    if (!normalized) {
      return formatLocalToolResult(null, false, "url is invalid");
    }
    input = { ...input, url: normalized };
  }

  if (input.action === "tab" && (input.index == null || input.index < 0)) {
    return formatLocalToolResult(
      null,
      false,
      "index is required for tab (use action=tabs to list open tabs)",
    );
  }

  const op = opForBrowserAction(input.action);

  const urlBootstrapsSession =
    Boolean(input.url?.trim())
    && (input.action === "evaluate" || input.action === "content" || input.action === "search");

  if (SESSION_ENSURE_ACTIONS.has(input.action) && !urlBootstrapsSession) {
    await invokeBrowserRuntime("session.ensure", {}, sid, 60_000);
  }

  const args: Record<string, unknown> = {};
  if (input.url) args.url = input.url;
  if (input.ref) args.ref = input.ref;
  if (input.x != null) args.x = input.x;
  if (input.y != null) args.y = input.y;
  if (input.text != null) args.text = input.text;
  if (input.value != null) args.value = input.value;
  if (input.key) args.key = input.key;
  if (input.waitUntil) args.waitUntil = input.waitUntil;
  if (input.timeoutMs != null) args.timeoutMs = input.timeoutMs;
  if (input.fullPage != null) args.fullPage = input.fullPage;
  if (input.state) args.state = input.state;
  if (input.delayMs != null) args.delayMs = input.delayMs;
  if (input.deltaX != null) args.deltaX = input.deltaX;
  if (input.deltaY != null) args.deltaY = input.deltaY;
  if (input.script) args.script = input.script;
  if (input.selector?.trim()) args.selector = input.selector.trim();
  if (input.offset != null) args.offset = input.offset;
  if (input.index != null) args.index = input.index;
  if (input.limit != null) args.limit = input.limit;
  args.includePreview = audience === "panel";

  const result = await invokeBrowserRuntime(op, args, sid, input.timeoutMs ?? 120_000);
  if (!result.ok) {
    return formatLocalToolResult(
      {
        action: input.action,
        sessionId: sid,
        op,
        mode: "headless",
        ...(options?.fallbackFromNative ? { fallbackFromNative: true } : {}),
      },
      false,
      result.message ?? result.error ?? "browser invoke failed",
    );
  }

  const payload: Record<string, unknown> = {
    action: input.action,
    sessionId: sid,
    mode: runtimeModeLabel("headless"),
    ...panelSyncFlags(audience, "headless", input.showPanel),
    ...(options?.fallbackFromNative ? { fallbackFromNative: true } : {}),
    ...(typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data }),
  };

  const data =
    audience === "agent" ? sanitizeBrowserToolDataForAgent(payload) : payload;

  return formatLocalToolResult(data);
}

async function executePanelBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserAutomationOptions,
): Promise<Record<string, unknown>> {
  if (!isNativeEmbeddedBrowserEnabled()) {
    return executeHeadlessBrowserTool(input, options);
  }

  if (await isEmbeddedBrowserRuntimeAvailable()) {
    const nativeResult = await executeEmbeddedBrowserTool(input, {
      ...options,
      audience: "panel",
    });
    if (nativeResult.ok === true) {
      return nativeResult;
    }
    if (shouldFallbackToPlaywrightFromNativeToolResult(nativeResult)) {
      return executeHeadlessBrowserTool(input, {
        ...options,
        audience: "panel",
        fallbackFromNative: true,
      });
    }
    return nativeResult;
  }

  return executeHeadlessBrowserTool(input, {
    ...options,
    audience: "panel",
    fallbackFromNative: true,
  });
}

export async function executeBrowserAutomation(
  input: BrowserToolInput,
  options?: ExecuteBrowserAutomationOptions,
): Promise<Record<string, unknown>> {
  const audience = options?.audience ?? "agent";

  if (audience === "panel") {
    return executePanelBrowserTool(input, options);
  }

  const embeddedAvailable =
    isNativeEmbeddedBrowserEnabled()
    && (await isEmbeddedBrowserRuntimeAvailable());

  const mode = resolveBrowserTarget({
    target: input.target,
    showPanel: input.showPanel ?? options?.showPanel,
    embeddedAvailable,
  });

  if (mode === "embedded") {
    const nativeResult = await executeEmbeddedBrowserTool(input, {
      ...options,
      showPanel: input.showPanel ?? options?.showPanel,
    });
    if (nativeResult.ok === true) {
      return nativeResult;
    }
    if (shouldFallbackToPlaywrightFromNativeToolResult(nativeResult)) {
      return executeHeadlessBrowserTool(input, {
        ...options,
        fallbackFromNative: true,
      });
    }
    return nativeResult;
  }

  return executeHeadlessBrowserTool(input, options);
}
