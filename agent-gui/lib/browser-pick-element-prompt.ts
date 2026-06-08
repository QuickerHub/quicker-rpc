export type BrowserPickElementContext = {
  url: string;
  title?: string | null;
  pickX: number;
  pickY: number;
  ref?: string | null;
  refRole?: string | null;
  refName?: string | null;
  tagName?: string | null;
  text?: string | null;
  elementId?: string | null;
  className?: string | null;
  href?: string | null;
  value?: string | null;
  snapshotLine?: string | null;
  sessionId?: string;
};

export function formatBrowserPickElementPrompt(
  ctx: BrowserPickElementContext,
): string {
  const lines: string[] = [
    "我选中了侧栏浏览器里的一个元素，请用 browser 工具继续操作（必要时先 snapshot 确认 ref）。",
    "",
    `- 页面: ${ctx.title?.trim() || ctx.url}`,
    `- URL: ${ctx.url}`,
    `- 坐标: (${ctx.pickX}, ${ctx.pickY})`,
  ];

  if (ctx.sessionId?.trim()) {
    lines.push(`- sessionId: ${ctx.sessionId.trim()}`);
  }
  if (ctx.ref?.trim()) {
    lines.push(`- ref: ${ctx.ref.trim()}（可直接 click/type/fill/press）`);
  }
  if (ctx.refRole?.trim()) {
    lines.push(`- role: ${ctx.refRole.trim()}`);
  }
  if (ctx.refName?.trim()) {
    lines.push(`- name: ${ctx.refName.trim()}`);
  }
  if (ctx.tagName?.trim()) {
    lines.push(`- tag: ${ctx.tagName.trim()}`);
  }
  if (ctx.elementId?.trim()) {
    lines.push(`- id: #${ctx.elementId.trim()}`);
  }
  if (ctx.className?.trim()) {
    lines.push(`- class: ${ctx.className.trim()}`);
  }
  if (ctx.href?.trim()) {
    lines.push(`- href: ${ctx.href.trim()}`);
  }
  if (ctx.value?.trim()) {
    lines.push(`- value: ${ctx.value.trim()}`);
  }
  if (ctx.text?.trim()) {
    lines.push(`- text: ${ctx.text.trim().slice(0, 160)}`);
  }
  if (ctx.snapshotLine?.trim()) {
    lines.push(`- snapshot: ${ctx.snapshotLine.trim()}`);
  }

  lines.push("", "请根据我的后续说明处理该元素。");
  return lines.join("\n");
}
