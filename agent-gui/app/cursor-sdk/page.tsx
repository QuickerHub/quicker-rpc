import { isCursorSdkDevEnabled } from "@/lib/cursor-sdk/dev-guard.server";
import { CursorSdkPage } from "@/components/cursor-sdk/CursorSdkPage";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  if (!isCursorSdkDevEnabled()) return null;

  const params = await searchParams;
  const cwd = typeof params.cwd === "string" ? params.cwd : undefined;

  return <CursorSdkPage initialCwd={cwd} />;
}
