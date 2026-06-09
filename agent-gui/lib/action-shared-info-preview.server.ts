import { randomUUID } from "node:crypto";

const PREVIEW_TTL_MS = 30 * 60 * 1000;

type PreviewEntry = {
  html: string;
  expiresAt: number;
};

const previewCache = new Map<string, PreviewEntry>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [token, entry] of previewCache) {
    if (entry.expiresAt <= now) {
      previewCache.delete(token);
    }
  }
}

export function buildSharedActionPageUrl(sharedId: string): string {
  const id = sharedId.trim();
  return `https://getquicker.net/Sharedaction?code=${encodeURIComponent(id)}`;
}

/** Stash built info.html (or Detail fragment) for side-panel browser preview. */
export function stashSharedInfoPreviewHtml(html: string): string {
  purgeExpired();
  const token = randomUUID();
  previewCache.set(token, {
    html,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  });
  return token;
}

export function readSharedInfoPreviewHtml(token: string): string | null {
  purgeExpired();
  const entry = previewCache.get(token.trim());
  if (!entry || entry.expiresAt <= Date.now()) {
    previewCache.delete(token.trim());
    return null;
  }
  return entry.html;
}

export function wrapSharedInfoPreviewDocument(html: string): string {
  const body = html.trim();
  if (!body) {
    return "<!DOCTYPE html><html><body><p>（空 HTML）</p></body></html>";
  }

  if (/^<!DOCTYPE/i.test(body) || /<html[\s>]/i.test(body)) {
    return body;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>动作说明预览</title>
  <style>
    body { margin: 0; padding: 16px 20px 32px; font-family: "Microsoft YaHei", system-ui, sans-serif; line-height: 1.65; }
    .qk-preview-banner { margin-bottom: 16px; padding: 10px 12px; border-radius: 8px; font-size: 13px;
      background: color-mix(in srgb, #f59e0b 12%, transparent); border: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
  </style>
</head>
<body>
  <p class="qk-preview-banner">agent-gui 草稿预览（非 getquicker 完整分享页）。上线效果请用右侧浏览器打开动作分享页核对。</p>
  ${body}
</body>
</html>`;
}

export function buildSharedInfoPreviewPath(token: string): string {
  return `/api/actions/shared-info/preview?token=${encodeURIComponent(token)}`;
}
