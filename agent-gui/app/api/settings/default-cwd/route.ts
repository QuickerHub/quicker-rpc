import {
  ensureReleaseWorkspaceDirectory,
  getDefaultWorkingDirectoryProfile,
  resolveDefaultWorkingDirectory,
} from "@/lib/default-working-directory";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = getDefaultWorkingDirectoryProfile();
  const cwd =
    profile === "documents" && !process.env.AGENT_GUI_DEFAULT_CWD?.trim()
      ? ensureReleaseWorkspaceDirectory()
      : resolveDefaultWorkingDirectory();

  return Response.json({ cwd, profile });
}
