import { resolveAppVersionSnapshot } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await resolveAppVersionSnapshot();
  return Response.json(snapshot);
}
