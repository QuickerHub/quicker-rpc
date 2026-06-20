/** Format /api/chat errors for the chat error banner. */
export function formatChatError(error: Error): string {
  const message = error.message?.trim();
  if (!message) {
    return "对话请求失败（无详细错误信息）。可打开开发者工具 Network 查看 /api/chat 响应。";
  }

  if (/^\s*<!DOCTYPE\s+html/i.test(message) || /<html[\s>]/i.test(message)) {
    const titleMatch = message.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim();
    return title
      ? `对话请求失败：/api/chat 返回了 HTML 页面（${title}），不是正常的 JSON/流式响应。请在 Network 里查看该请求的状态码，并看运行 agent-gui 的终端是否有报错。`
      : "对话请求失败：/api/chat 返回了 HTML 页面而非 JSON。请确认 agent-gui 已正确启动，并在 Network 中查看 /api/chat 的状态码与响应。";
  }

  try {
    const parsed = JSON.parse(message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    /* plain text from /api/chat */
  }

  if (message.length > 500) {
    return `${message.slice(0, 480)}…（响应过长，完整内容见 Network → /api/chat）`;
  }
  return message;
}
