#!/usr/bin/env node
/**
 * Probe NVIDIA NIM (integrate.api.nvidia.com) tool-calling for launcher-style tasks.
 *
 * Usage:
 *   $env:NVIDIA_API_KEY = "nvapi-..."
 *   node agent-gui/scripts/probe-nvidia-nim-tool-calling.mjs
 *
 * Options (env):
 *   NVIDIA_API_KEY   required
 *   NVIDIA_BASE_URL  default https://integrate.api.nvidia.com/v1
 *   NVIDIA_MODELS    comma-separated model ids; default = launcher candidate set
 *   NVIDIA_TIMEOUT_MS default 45000
 */

const BASE_URL = (
  process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1"
).replace(/\/+$/, "");
const API_KEY = process.env.NVIDIA_API_KEY?.trim();
const TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS ?? "45000");

const DEFAULT_MODELS = [
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.3-70b-instruct",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "deepseek-ai/deepseek-v4-flash",
  "z-ai/glm-5.1",
  "microsoft/phi-4-mini-instruct",
  "qwen/qwen3-next-80b-a3b-instruct",
  "stepfun-ai/step-3.5-flash",
];

const TOOLS = [
  {
    type: "function",
    function: {
      name: "qkrpc_action",
      description:
        "Quicker action operations: list, search, get, run, create, etc.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "search", "get", "run", "create"],
            description: "Operation to perform",
          },
          query: {
            type: "string",
            description: "Search keyword when action=search",
          },
          id: {
            type: "string",
            description: "Action GUID when action=get|run",
          },
          limit: {
            type: "integer",
            description: "Max results for list/search",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quicker_settings",
      description: "Search, read, or change Quicker app settings",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["search", "get", "set", "open"],
          },
          query: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
];

const PROMPTS = [
  {
    id: "search-clipboard",
    text: "搜索名称里带剪贴板的 Quicker 动作，最多 5 条",
    expectTool: "qkrpc_action",
    expectAction: "search",
  },
  {
    id: "open-settings",
    text: "打开 Quicker 应用设置界面",
    expectTool: "quicker_settings",
    expectAction: "open",
  },
];

function parseModels() {
  const raw = process.env.NVIDIA_MODELS?.trim();
  if (!raw) return DEFAULT_MODELS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function fetchJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function classifyToolResult(prompt, message) {
  const toolCalls = message?.tool_calls ?? [];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    const content = typeof message?.content === "string" ? message.content : "";
    return {
      ok: false,
      reason: content ? "text-only" : "no-tool-call",
      content: content.slice(0, 200),
      toolCalls: [],
    };
  }

  const first = toolCalls[0];
  const fn = first?.function ?? {};
  let args = {};
  try {
    args = fn.arguments ? JSON.parse(fn.arguments) : {};
  } catch {
    args = { _parseError: true, raw: String(fn.arguments ?? "").slice(0, 200) };
  }

  const nameOk = fn.name === prompt.expectTool;
  const actionOk = args.action === prompt.expectAction;
  return {
    ok: nameOk && actionOk,
    reason:
      nameOk && actionOk
        ? "ok"
        : nameOk
          ? "wrong-args"
          : "wrong-tool",
    toolCalls: toolCalls.map((tc) => ({
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    })),
    parsedArgs: args,
  };
}

async function probeModel(model, prompt) {
  const started = Date.now();
  const body = {
    model,
    messages: [{ role: "user", content: prompt.text }],
    tools: TOOLS,
    tool_choice: "auto",
    max_tokens: 512,
    temperature: 0,
  };

  try {
    const { status, json } = await fetchJson("/chat/completions", body);
    const latencyMs = Date.now() - started;

    if (status !== 200) {
      const err =
        json?.detail
        ?? json?.error?.message
        ?? json?.message
        ?? JSON.stringify(json).slice(0, 300);
      return { model, prompt: prompt.id, status, latencyMs, ok: false, reason: `http-${status}`, error: err };
    }

    const message = json?.choices?.[0]?.message;
    const verdict = classifyToolResult(prompt, message);
    return {
      model,
      prompt: prompt.id,
      status,
      latencyMs,
      ...verdict,
      finishReason: json?.choices?.[0]?.finish_reason,
    };
  } catch (error) {
    return {
      model,
      prompt: prompt.id,
      ok: false,
      reason: "fetch-error",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    };
  }
}

function summarize(results) {
  const byModel = new Map();
  for (const row of results) {
    if (!byModel.has(row.model)) {
      byModel.set(row.model, { model: row.model, prompts: [], score: 0, maxLatency: 0 });
    }
    const entry = byModel.get(row.model);
    entry.prompts.push(row);
    if (row.ok) entry.score += 1;
    if (row.latencyMs) entry.maxLatency = Math.max(entry.maxLatency, row.latencyMs);
  }

  return [...byModel.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.maxLatency - b.maxLatency;
  });
}

async function main() {
  if (!API_KEY) {
    console.error("NVIDIA_API_KEY is required (get one at https://build.nvidia.com/)");
    process.exit(1);
  }

  const models = parseModels();
  console.log(`Probing ${models.length} models @ ${BASE_URL}`);
  console.log(`Prompts: ${PROMPTS.map((p) => p.id).join(", ")}\n`);

  const results = [];
  for (const model of models) {
    for (const prompt of PROMPTS) {
      process.stdout.write(`.. ${model} / ${prompt.id} `);
      const row = await probeModel(model, prompt);
      results.push(row);
      const mark = row.ok ? "OK" : row.reason;
      console.log(`${mark} (${row.latencyMs ?? "?"}ms)`);
      if (!row.ok && row.error) {
        console.log(`   ${String(row.error).slice(0, 160)}`);
      }
    }
  }

  console.log("\n=== Summary (higher score = better) ===");
  for (const row of summarize(results)) {
    const flags = row.prompts
      .map((p) => `${p.prompt}:${p.ok ? "ok" : p.reason}`)
      .join(" | ");
    console.log(
      `${row.score}/${PROMPTS.length}  ${row.maxLatency}ms  ${row.model}  [${flags}]`,
    );
  }

  const passed = summarize(results).filter((r) => r.score === PROMPTS.length);
  if (passed.length) {
    console.log("\nRecommended for launcher:");
    for (const r of passed.slice(0, 5)) {
      console.log(`  - ${r.model} (${r.maxLatency}ms)`);
    }
  } else {
    const partial = summarize(results).filter((r) => r.score > 0);
    if (partial.length) {
      console.log("\nPartial tool-calling (may need prompt tuning):");
      for (const r of partial.slice(0, 5)) {
        console.log(`  - ${r.model} score=${r.score}`);
      }
    } else {
      console.log("\nNo model passed tool-calling probes.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
