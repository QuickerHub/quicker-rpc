/**
 * Multi-turn DeepSeek probe via production /api/chat stack.
 *
 *   NODE_ENV=development node scripts/probe-context-cache-tokens.mjs
 *   NODE_ENV=development node scripts/probe-context-cache-tokens.mjs --turns 4 --base http://127.0.0.1:3000
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonEventStream } from "@ai-sdk/provider-utils";
import { readUIMessageStream, uiMessageChunkSchema } from "ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DEFAULT_PROMPTS = [
  "你好，请用一句话介绍你能帮用户做什么。",
  "复述一下你刚才那句话里的核心能力（不要展开）。",
  "用一句话说一个与 Quicker 无关的客观事实。",
  "用一句话总结我们上面三轮对话的主题。",
];

function parseArgs(argv) {
  const turnsIdx = argv.indexOf("--turns");
  const baseIdx = argv.indexOf("--base");
  const turns =
    turnsIdx >= 0 ? Math.max(1, Math.min(12, Number(argv[turnsIdx + 1]) || 4)) : 4;
  const base =
    (baseIdx >= 0 ? argv[baseIdx + 1] : process.env.AGENT_GUI_EVAL_BASE_URL)
    ?? "http://127.0.0.1:3000";
  return { turns, base: base.replace(/\/$/, "") };
}

function sha8(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

function userMessage(id, text) {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

async function waitForServer(baseUrl, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/ping`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`agent-gui not reachable at ${baseUrl} after ${timeoutMs}ms`);
}

async function parseChatStream(body, priorMessages, userMsg) {
  const messages = [...priorMessages, userMsg];
  let lastAssistant;

  const chunkStream = parseJsonEventStream({
    stream: body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) {
          controller.error(chunk.error);
          return;
        }
        controller.enqueue(chunk.value);
      },
    }),
  );

  for await (const uiMessage of readUIMessageStream({ stream: chunkStream })) {
    if (uiMessage.role === "assistant") {
      lastAssistant = uiMessage;
    }
  }

  if (!lastAssistant) {
    throw new Error("no assistant message in stream");
  }
  messages.push(lastAssistant);
  return messages;
}

function textFromAssistant(message) {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function readDevModelHint() {
  try {
    const raw = JSON.parse(
      readFileSync(join(ROOT, "llm-dev.config.json"), "utf8"),
    );
    const endpoint = raw.endpoints?.find((e) => e.group === "deepseek");
    return endpoint?.model ?? raw.groups?.deepseek?.model ?? "deepseek";
  } catch {
    return "deepseek";
  }
}

async function postChatTurn({ base, messages, workingDirectory, llmSelection }) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      workingDirectory,
      llmSelection,
      llmProvider: llmSelection,
      chatMode: "agent",
      enabledTools: ["docs", "Read"],
      titleManual: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let err = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) err = parsed.error;
    } catch {
      // keep raw
    }
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  if (!res.body) throw new Error("empty response body");
  return res.body;
}

async function main() {
  const { turns, base } = parseArgs(process.argv.slice(2));
  await waitForServer(base);

  const prompts = DEFAULT_PROMPTS.slice(0, turns);
  while (prompts.length < turns) {
    prompts.push(`继续第 ${prompts.length + 1} 轮：用一句话回复「收到」。`);
  }

  const llmSelection = "deepseek";
  const workingDirectory = ROOT;
  let messages = [];
  const rows = [];
  let prevInput = null;

  for (let i = 0; i < prompts.length; i += 1) {
    const user = userMessage(`probe-u-${i}`, prompts[i]);
    const stream = await postChatTurn({
      base,
      messages: [...messages, user],
      workingDirectory,
      llmSelection,
    });
    messages = await parseChatStream(stream, messages, user);

    const assistant = messages[messages.length - 1];
    const meta = assistant.metadata ?? {};
    const inputTokens = meta.inputTokens ?? null;
    const outputTokens = meta.outputTokens ?? null;
    const totalTokens = meta.totalTokens ?? null;
    const compression = meta.contextCompression ?? null;
    const deltaInput =
      inputTokens != null && prevInput != null ? inputTokens - prevInput : null;

    rows.push({
      turn: i + 1,
      userPreview: prompts[i].slice(0, 48),
      inputTokens,
      outputTokens,
      totalTokens,
      deltaInputTokens: deltaInput,
      inputGrowthRatio:
        prevInput != null && inputTokens != null
          ? Number((inputTokens / prevInput).toFixed(3))
          : null,
      compressed: Boolean(compression),
      summaryReused: compression?.summaryReused ?? false,
      contextCompression: compression
        ? {
            splitReason: compression.splitReason ?? null,
            summaryReused: compression.summaryReused ?? false,
            throughMessageId: compression.throughMessageId ?? null,
          }
        : null,
      model: meta.model ?? null,
      replyPreview: textFromAssistant(assistant).slice(0, 80),
    });

    if (inputTokens != null) prevInput = inputTokens;
  }

  const table = rows.map((r) => ({
    轮次: r.turn,
    input: r.inputTokens,
    output: r.outputTokens,
    total: r.totalTokens,
    "input增量": r.deltaInputTokens,
    "input倍率": r.inputGrowthRatio,
    压缩: r.compressed ? "是" : "否",
    摘要复用: r.summaryReused ? "是" : "否",
  }));

  console.log(
    JSON.stringify(
      {
        baseUrl: base,
        llmSelection,
        devModelHint: readDevModelHint(),
        note:
          "input倍率≈1 表示前缀稳定；远大于 1 表示每轮 system/历史变动大。DeepSeek 若返回 cached tokens 会出现在 finish-step metadata（当前 UI 流仅记录 input/output）。",
        turns: rows,
        table,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
