import type { Browser, Page } from "playwright";
import { chromium } from "playwright";

import { parseAgentGuiChatResponseBody } from "@/lib/agent-eval/chat-stream";
import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import type { AgentEvalScenario } from "@/lib/agent-eval/eval-scenario";
import type { AgentEvalRuntimeMetadata } from "@/lib/agent-eval/types";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  isToolTestSidebarTab,
  TOOL_TEST_SIDEBAR_TAB_STORAGE_KEY,
  type ToolTestSidebarTab,
} from "@/lib/tool-test-sidebar-prefs";

export type ToolTestUiPanel = "prompt-chat" | "launcher" | "quickerbench";

export type ToolTestUiRunRequest = {
  baseUrl?: string;
  scenario: AgentEvalScenario;
  workingDirectory: string;
  timeoutMs?: number;
  headless?: boolean;
  browser?: Browser;
};

export type ToolTestUiRunResult = {
  ok: boolean;
  messages: AgentUIMessage[];
  runtimeMetadata: AgentEvalRuntimeMetadata[];
  error?: string;
  httpStatus?: number;
};

function resolveTimeoutMs(): number {
  const raw = process.env.AGENT_EVAL_UI_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180_000;
}

export function resolveToolTestUiPanel(
  scenario: AgentEvalScenario,
): ToolTestUiPanel {
  if (scenario.source === "quickerbench") return "quickerbench";
  return scenario.chatMode === "launcher" ? "launcher" : "prompt-chat";
}

export function buildToolTestEvalUrl(
  baseUrl: string,
  options: {
    tab: ToolTestUiPanel;
    cwd?: string;
  },
): string {
  const root = baseUrl.replace(/\/$/, "");
  if (options.tab === "quickerbench") {
    return `${root}/bench`;
  }
  const url = new URL("/tool-test", root);
  url.searchParams.set("tab", options.tab);
  if (options.cwd?.trim()) {
    url.searchParams.set("cwd", options.cwd.trim());
  }
  return url.toString();
}

async function waitForLlmReady(
  page: Page,
  timeoutMs: number,
  panel: ToolTestUiPanel,
  scenarioId?: string,
): Promise<void> {
  if (panel === "quickerbench") {
    const testId = scenarioId
      ? `tool-test-quickerbench-task-${scenarioId}`
      : "tool-test-quickerbench-task-user-action-likes-total";
    const target = page.getByTestId(testId);
    await target.waitFor({ state: "visible", timeout: timeoutMs });
    await page.waitForFunction(
      (id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el instanceof HTMLButtonElement && !el.disabled;
      },
      testId,
      { timeout: timeoutMs },
    );
    return;
  }
  const sendTestId =
    panel === "launcher" ? "tool-test-launcher-run" : "tool-test-prompt-send";
  const target = page.getByTestId(sendTestId);
  await target.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(
    (testId) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      return el instanceof HTMLButtonElement && !el.disabled;
    },
    sendTestId,
    { timeout: timeoutMs },
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseAgentRuntimeMetadataAttributes(
  values: readonly (string | null | undefined)[],
): AgentEvalRuntimeMetadata[] {
  const parsed: AgentEvalRuntimeMetadata[] = [];
  for (const value of values) {
    if (!value?.trim()) continue;
    try {
      const raw = asRecord(JSON.parse(value));
      const recoveryDecision = asRecord(raw?.recoveryDecision);
      const turnStateRaw = raw?.turnState;
      const turnState =
        turnStateRaw === null ? null : asRecord(turnStateRaw);
      const feedbackCount =
        typeof raw?.feedbackCount === "number" && Number.isFinite(raw.feedbackCount)
          ? raw.feedbackCount
          : 0;
      if (!raw || !recoveryDecision || turnState === undefined) continue;
      parsed.push({
        feedbackCount,
        recoveryDecision,
        turnState,
      });
    } catch {
      /* Ignore malformed DOM metadata from older dev builds. */
    }
  }
  return parsed;
}

async function readRuntimeMetadataFromPage(
  page: Page,
): Promise<AgentEvalRuntimeMetadata[]> {
  const values = await page
    .locator("[data-agent-runtime-metadata]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-agent-runtime-metadata")),
    )
    .catch(() => []);
  return parseAgentRuntimeMetadataAttributes(values);
}

async function waitForRuntimeMetadataPaint(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-agent-runtime-metadata]").length > 0,
      undefined,
      { timeout: 1_500 },
    )
    .catch(() => undefined);
}

async function runPromptChatPanel(
  page: Page,
  prompt: string,
  timeoutMs: number,
): Promise<ToolTestUiRunResult> {
  const input = page.getByTestId("tool-test-prompt-input");
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  await input.fill(prompt);

  const send = page.getByTestId("tool-test-prompt-send");
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/chat")
      && res.request().method() === "POST",
    { timeout: timeoutMs },
  );

  await send.click();
  const response = await responsePromise;
  const parsed = await parseAgentGuiChatResponseBody({
    ok: response.ok(),
    body: await response.text(),
    status: response.status(),
    seedUserText: prompt,
  });
  await waitForRuntimeMetadataPaint(page);
  return {
    ok: parsed.ok,
    messages: parsed.messages,
    runtimeMetadata: await readRuntimeMetadataFromPage(page),
    error: parsed.error,
    httpStatus: response.status(),
  };
}

async function runLauncherPanel(
  page: Page,
  prompt: string,
  timeoutMs: number,
): Promise<ToolTestUiRunResult> {
  const input = page.getByTestId("tool-test-launcher-prompt");
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  await input.fill(prompt);

  const run = page.getByTestId("tool-test-launcher-run");
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/chat")
      && res.request().method() === "POST",
    { timeout: timeoutMs },
  );

  await run.click();
  const response = await responsePromise;
  const parsed = await parseAgentGuiChatResponseBody({
    ok: response.ok(),
    body: await response.text(),
    status: response.status(),
    seedUserText: prompt,
  });
  await waitForRuntimeMetadataPaint(page);
  return {
    ok: parsed.ok,
    messages: parsed.messages,
    runtimeMetadata: await readRuntimeMetadataFromPage(page),
    error: parsed.error,
    httpStatus: response.status(),
  };
}

async function runQuickerBenchPanel(
  page: Page,
  taskId: string,
  timeoutMs: number,
): Promise<ToolTestUiRunResult> {
  const taskButton = page.getByTestId(`tool-test-quickerbench-task-${taskId}`);
  await taskButton.waitFor({ state: "visible", timeout: timeoutMs });

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/chat")
      && res.request().method() === "POST",
    { timeout: timeoutMs },
  );

  await taskButton.click();
  const response = await responsePromise;
  const parsed = await parseAgentGuiChatResponseBody({
    ok: response.ok(),
    body: await response.text(),
    status: response.status(),
    seedUserText: "",
  });
  await waitForRuntimeMetadataPaint(page);
  return {
    ok: parsed.ok,
    messages: parsed.messages,
    runtimeMetadata: await readRuntimeMetadataFromPage(page),
    error: parsed.error,
    httpStatus: response.status(),
  };
}

export async function runToolTestUiEval(
  request: ToolTestUiRunRequest,
): Promise<ToolTestUiRunResult> {
  const baseUrl = request.baseUrl ?? defaultAgentGuiBaseUrl();
  const timeoutMs = request.timeoutMs ?? resolveTimeoutMs();
  const panel = resolveToolTestUiPanel(request.scenario);
  const url = buildToolTestEvalUrl(baseUrl, {
    tab: panel,
    cwd: request.workingDirectory,
  });

  const ownsBrowser = !request.browser;
  const browser =
    request.browser
    ?? (await chromium.launch({
      headless: request.headless ?? true,
      channel: process.env.AGENT_EVAL_UI_BROWSER_CHANNEL?.trim() || "msedge",
    }));

  const page = await browser.newPage();

  try {
    await page.addInitScript(
      ({ key, tab }) => {
        try {
          localStorage.setItem(key, tab);
        } catch {
          /* ignore */
        }
      },
      {
        key: TOOL_TEST_SIDEBAR_TAB_STORAGE_KEY,
        tab: panel,
      },
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await waitForLlmReady(page, timeoutMs, panel, request.scenario.id);

    if (panel === "launcher") {
      return await runLauncherPanel(page, request.scenario.userPrompt, timeoutMs);
    }
    if (panel === "quickerbench") {
      return await runQuickerBenchPanel(page, request.scenario.id, timeoutMs);
    }
    return await runPromptChatPanel(page, request.scenario.userPrompt, timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      messages: [],
      runtimeMetadata: [],
      error: message,
    };
  } finally {
    await page.close().catch(() => undefined);
    if (ownsBrowser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export function parseToolTestEvalTabParam(
  value: string | undefined,
): ToolTestSidebarTab | undefined {
  if (!value?.trim()) return undefined;
  return isToolTestSidebarTab(value) ? value : undefined;
}
