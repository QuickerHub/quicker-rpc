import { redirect } from "next/navigation";
import { ToolTestPage } from "@/components/tool-test/ToolTestPage";
import {
  isToolTestSidebarTab,
  type ToolTestSidebarTab,
} from "@/lib/tool-test-sidebar-prefs";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseEvalTab(value: string | undefined): ToolTestSidebarTab | undefined {
  if (!value?.trim()) return undefined;
  return isToolTestSidebarTab(value) ? value : undefined;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const tabRaw = typeof params.tab === "string" ? params.tab : undefined;
  if (tabRaw === "quickerbench") {
    redirect("/bench");
  }
  const cwd = typeof params.cwd === "string" ? params.cwd : undefined;

  return (
    <ToolTestPage evalTab={parseEvalTab(tabRaw)} evalCwd={cwd} />
  );
}
