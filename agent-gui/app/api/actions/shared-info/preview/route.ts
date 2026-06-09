import {
  buildSharedInfoPreviewPath,
  readSharedInfoPreviewHtml,
  stashSharedInfoPreviewHtml,
  wrapSharedInfoPreviewDocument,
} from "@/lib/action-shared-info-preview.server";

export const dynamic = "force-dynamic";

type PreviewPostBody = {
  html?: string;
};

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return new Response("缺少 token", { status: 400 });
  }

  const html = readSharedInfoPreviewHtml(token);
  if (!html) {
    return new Response("预览已过期或不存在", { status: 404 });
  }

  return new Response(wrapSharedInfoPreviewDocument(html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as PreviewPostBody;
  const html = body.html ?? "";
  if (!html.trim()) {
    return Response.json({ ok: false, error: "html 不能为空" }, { status: 400 });
  }

  const token = stashSharedInfoPreviewHtml(html);
  const previewPath = buildSharedInfoPreviewPath(token);
  const origin = new URL(req.url).origin;

  return Response.json({
    ok: true,
    token,
    previewPath,
    previewUrl: `${origin}${previewPath}`,
  });
}
