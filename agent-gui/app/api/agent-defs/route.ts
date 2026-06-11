import { discoverAgentDefs } from "@/lib/agent-defs/discover.server";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cwdParam = url.searchParams.get("cwd")?.trim() ?? "";
    const cwd = resolveEffectiveWorkingDirectory(cwdParam);
    const catalog = await discoverAgentDefs(cwd);

    return Response.json({
      ok: true,
      cwd,
      commands: catalog.commands.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.argumentHint,
        scope: c.scope,
      })),
      agents: catalog.agents.map((a) => ({
        name: a.name,
        description: a.description,
        scope: a.scope,
      })),
      skills: catalog.skills.map((s) => ({
        name: s.name,
        description: s.description,
        scope: s.scope,
      })),
      diagnostics: catalog.diagnostics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
