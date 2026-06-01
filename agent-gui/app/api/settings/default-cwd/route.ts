import { resolveRepoRoot } from "@/lib/repo-root";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ cwd: resolveRepoRoot() });
}
