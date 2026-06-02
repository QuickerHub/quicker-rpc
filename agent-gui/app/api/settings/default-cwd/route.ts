import {
  getDefaultWorkingDirectoryProfile,
  resolveDefaultWorkingDirectory,
} from "@/lib/default-working-directory";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    cwd: resolveDefaultWorkingDirectory(),
    profile: getDefaultWorkingDirectoryProfile(),
  });
}
