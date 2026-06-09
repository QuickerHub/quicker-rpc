import {
  invokeActionSharedInfoGet,
  invokeActionSharedInfoSet,
} from "@/lib/action-shared-info.server";

export const dynamic = "force-dynamic";

type SharedInfoBody = {
  op?: string;
  id?: string;
  code?: string;
  html?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? url.searchParams.get("code") ?? "").trim();
  if (!id) {
    return Response.json({ ok: false, error: "缺少 id 或 code 查询参数" }, { status: 400 });
  }

  const result = await invokeActionSharedInfoGet(id);
  if (!result.ok) {
    return Response.json(result, { status: 502 });
  }
  return Response.json(result);
}

export async function POST(req: Request) {
  const body = (await req.json()) as SharedInfoBody;
  const op = body.op?.trim().toLowerCase();
  const id = (body.id ?? body.code ?? "").trim();

  if (!id) {
    return Response.json({ ok: false, error: "缺少 id 或 code" }, { status: 400 });
  }

  if (op === "get" || op === "shared-info-get") {
    const result = await invokeActionSharedInfoGet(id);
    if (!result.ok) {
      return Response.json(result, { status: 502 });
    }
    return Response.json(result);
  }

  if (op === "set" || op === "shared-info-set") {
    const html = body.html ?? "";
    const result = await invokeActionSharedInfoSet(id, html);
    if (!result.ok) {
      return Response.json(result, { status: 502 });
    }
    return Response.json(result);
  }

  return Response.json(
    { ok: false, error: "op 须为 get 或 set（shared-info-get / shared-info-set）" },
    { status: 400 },
  );
}
