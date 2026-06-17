import {
  buildClickScript,
  buildContentScript,
  buildFillScript,
  buildPressScript,
  buildTypeScript,
  wrapUserScript,
} from "@/lib/browser-to-action/scripts";
import type {
  BrowserRecordingEntry,
  BrowserToActionOptions,
  BrowserToActionResult,
  BrowserToActionSkipped,
  WorkspaceActionStep,
  WorkspaceActionVariable,
} from "@/lib/browser-to-action/types";

const DEFAULT_TAB_VAR = "browserTab";
const SKIPPED_ACTIONS = new Set([
  "status",
  "snapshot",
  "search",
  "tabs",
  "tab",
  "wait",
  "scroll",
  "back",
  "forward",
  "click_xy",
  "screenshot",
  "pick_element",
]);

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function commentStep(note: string): WorkspaceActionStep {
  return {
    stepRunnerKey: "sys:comment",
    inputParams: { note },
  };
}

function chromeStep(
  operation: string,
  params: Record<string, unknown>,
  outputParams?: Record<string, string>,
): WorkspaceActionStep {
  return {
    stepRunnerKey: "sys:chromecontrol",
    inputParams: { operation, ...params },
    ...(outputParams ? { outputParams } : {}),
  };
}

function tabVarBinding(tabVar: string): Record<string, string> {
  return { "tabId.var": tabVar };
}

function openUrlStep(url: string, tabVar: string): WorkspaceActionStep {
  return chromeStep(
    "OpenUrl",
    {
      url,
      windowId: "New",
      waitComplete: true,
    },
    { tabId: tabVar },
  );
}

function runScriptStep(
  script: string,
  tabVar: string,
  outputVar?: string,
): WorkspaceActionStep {
  return chromeStep(
    "RunScript",
    {
      ...tabVarBinding(tabVar),
      script,
      executionWorld: "MAIN",
    },
    outputVar ? { rawResponse: outputVar } : undefined,
  );
}

function convertUserBrowserEntry(
  entry: BrowserRecordingEntry,
  ctx: ConversionContext,
): void {
  const input = entry.input;
  const action = readString(input, "action");
  if (action !== "run") {
    ctx.skipped.push({ action: action ?? "?", reason: "user_browser: only action=run is converted" });
    return;
  }
  const operation = readString(input, "operation");
  if (!operation) {
    ctx.skipped.push({ action: "run", reason: "user_browser: missing operation" });
    return;
  }
  const parameters =
    typeof input.parameters === "object" && input.parameters !== null
      ? (input.parameters as Record<string, unknown>)
      : {};

  const inputParams: Record<string, unknown> = { operation, ...parameters };
  const outputParams: Record<string, string> = {};

  if (operation === "OpenUrl" && !parameters["tabId.var"] && !parameters.tabId) {
    outputParams.tabId = ctx.tabVar;
  }

  ctx.steps.push({
    stepRunnerKey: "sys:chromecontrol",
    inputParams,
    ...(Object.keys(outputParams).length > 0 ? { outputParams } : {}),
  });
  ctx.hasTab = true;
}

type ConversionContext = {
  tabVar: string;
  addComments: boolean;
  steps: WorkspaceActionStep[];
  skipped: BrowserToActionSkipped[];
  warnings: string[];
  hasTab: boolean;
  lastScriptOutputVar: string | null;
  scriptCounter: number;
};

function ensureTab(ctx: ConversionContext, url?: string): void {
  if (ctx.hasTab) return;
  const openUrl = url ?? "https://";
  if (ctx.addComments) {
    ctx.steps.push(commentStep(`Open ${openUrl}`));
  }
  ctx.steps.push(openUrlStep(openUrl, ctx.tabVar));
  ctx.hasTab = true;
}

function nextScriptOutputVar(ctx: ConversionContext): string {
  ctx.scriptCounter += 1;
  const name = ctx.scriptCounter === 1 ? "pageResult" : `pageResult${ctx.scriptCounter}`;
  ctx.lastScriptOutputVar = name;
  return name;
}

function convertBrowserEntry(entry: BrowserRecordingEntry, ctx: ConversionContext): void {
  const input = entry.input;
  const action = readString(input, "action") ?? "?";

  if (SKIPPED_ACTIONS.has(action)) {
    ctx.skipped.push({
      action,
      reason: "discovery/session action — not emitted as chromecontrol step",
    });
    return;
  }

  const url = readString(input, "url");
  const ref = readString(input, "ref");
  const refTarget = entry.refTarget ?? (ref ? undefined : undefined);

  switch (action) {
    case "navigate": {
      if (!url) {
        ctx.skipped.push({ action, reason: "navigate: missing url" });
        return;
      }
      if (ctx.addComments) ctx.steps.push(commentStep(`Navigate → ${url}`));
      ctx.steps.push(openUrlStep(url, ctx.tabVar));
      ctx.hasTab = true;
      return;
    }
    case "evaluate": {
      const script = readString(input, "script");
      if (!script) {
        ctx.skipped.push({ action, reason: "evaluate: missing script" });
        return;
      }
      if (url) {
        if (ctx.addComments) ctx.steps.push(commentStep(`Open ${url}`));
        ctx.steps.push(openUrlStep(url, ctx.tabVar));
        ctx.hasTab = true;
      } else {
        ensureTab(ctx);
      }
      if (ctx.addComments) ctx.steps.push(commentStep("Run page script"));
      const outVar = nextScriptOutputVar(ctx);
      ctx.steps.push(runScriptStep(wrapUserScript(script), ctx.tabVar, outVar));
      return;
    }
    case "content": {
      ensureTab(ctx, url);
      const selector = entry.selector ?? readString(input, "selector");
      if (ctx.addComments) {
        ctx.steps.push(commentStep(selector ? `Extract ${selector}` : "Extract page text"));
      }
      const outVar = nextScriptOutputVar(ctx);
      ctx.steps.push(runScriptStep(buildContentScript(selector), ctx.tabVar, outVar));
      return;
    }
    case "click": {
      if (!refTarget) {
        ctx.skipped.push({
          action,
          reason: ref
            ? `click ${ref}: no refTarget — include snapshot/search before click in recordings`
            : "click: missing ref",
        });
        return;
      }
      ensureTab(ctx, url);
      if (ctx.addComments) ctx.steps.push(commentStep(`Click ${ref ?? refTarget.role}`));
      ctx.steps.push(runScriptStep(buildClickScript(refTarget), ctx.tabVar));
      return;
    }
    case "fill": {
      const value = readString(input, "value") ?? readString(input, "text") ?? "";
      if (!refTarget) {
        ctx.skipped.push({ action, reason: "fill: missing refTarget" });
        return;
      }
      ensureTab(ctx, url);
      if (ctx.addComments) ctx.steps.push(commentStep(`Fill ${ref ?? refTarget.role}`));
      ctx.steps.push(runScriptStep(buildFillScript(refTarget, value), ctx.tabVar));
      return;
    }
    case "type": {
      const text = readString(input, "text") ?? "";
      if (!refTarget) {
        ctx.skipped.push({ action, reason: "type: missing refTarget" });
        return;
      }
      ensureTab(ctx, url);
      if (ctx.addComments) ctx.steps.push(commentStep(`Type into ${ref ?? refTarget.role}`));
      ctx.steps.push(runScriptStep(buildTypeScript(refTarget, text), ctx.tabVar));
      return;
    }
    case "press": {
      const key = readString(input, "key");
      if (!key) {
        ctx.skipped.push({ action, reason: "press: missing key" });
        return;
      }
      ensureTab(ctx, url);
      if (ctx.addComments) ctx.steps.push(commentStep(`Press ${key}`));
      ctx.steps.push(
        runScriptStep(buildPressScript(key, refTarget ?? undefined), ctx.tabVar),
      );
      return;
    }
    case "reload": {
      ensureTab(ctx, url);
      ctx.steps.push(chromeStep("Reload", tabVarBinding(ctx.tabVar)));
      return;
    }
    case "close": {
      if (!ctx.hasTab) {
        ctx.warnings.push("close before OpenUrl — step may fail at runtime");
      }
      ctx.steps.push(chromeStep("CloseTab", tabVarBinding(ctx.tabVar)));
      ctx.hasTab = false;
      return;
    }
    default:
      ctx.skipped.push({ action, reason: "unsupported browser action" });
  }
}

function buildVariables(
  tabVar: string,
  scriptVars: string[],
  clipboardVar: string | null,
): WorkspaceActionVariable[] {
  const keys = new Set<string>([tabVar, ...scriptVars]);
  if (clipboardVar) keys.add(clipboardVar);

  return [...keys].map((key) => ({
    key,
    type: 0,
    defaultValue: "",
  }));
}

export function convertBrowserRecordingsToAction(
  recordings: BrowserRecordingEntry[],
  options?: BrowserToActionOptions,
): BrowserToActionResult {
  const tabVar = options?.tabVariable?.trim() || DEFAULT_TAB_VAR;
  const addComments = options?.addComments !== false;

  const ctx: ConversionContext = {
    tabVar,
    addComments,
    steps: [],
    skipped: [],
    warnings: [],
    hasTab: false,
    lastScriptOutputVar: null,
    scriptCounter: 0,
  };

  if (recordings.length === 0) {
    return {
      ok: false,
      dataJson: { variables: [], steps: [] },
      steps: [],
      variables: [],
      warnings: [],
      skipped: [],
      summary: "No recordings to convert",
    };
  }

  for (const entry of recordings) {
    if (entry.source === "user_browser") {
      convertUserBrowserEntry(entry, ctx);
    } else {
      convertBrowserEntry(entry, ctx);
    }
  }

  const scriptVars: string[] = [];
  if (ctx.scriptCounter > 0) {
    for (let i = 1; i <= ctx.scriptCounter; i += 1) {
      scriptVars.push(i === 1 ? "pageResult" : `pageResult${i}`);
    }
  }

  let clipboardVar: string | null = null;
  if (options?.clipboardFromLastScript && ctx.lastScriptOutputVar) {
    clipboardVar = "clip";
    ctx.steps.push({
      stepRunnerKey: "sys:writeclipboard",
      inputParams: {
        text: `$$${ctx.lastScriptOutputVar}`,
      },
    });
    ctx.warnings.push(
      "writeclipboard uses expression — verify quicker-eval-expression wire format after patch",
    );
  }

  const variables = buildVariables(tabVar, scriptVars, clipboardVar);

  if (!ctx.hasTab && ctx.steps.length > 0) {
    ctx.warnings.push("No OpenUrl step — action assumes an active browser tab");
  }

  const stepCount = ctx.steps.filter((s) => s.stepRunnerKey !== "sys:comment").length;
  const summary =
    stepCount > 0
      ? `Generated ${stepCount} chromecontrol step(s), ${ctx.skipped.length} skipped`
      : "No convertible steps";

  return {
    ok: stepCount > 0,
    dataJson: { variables, steps: ctx.steps },
    steps: ctx.steps,
    variables,
    warnings: ctx.warnings,
    skipped: ctx.skipped,
    summary,
  };
}
