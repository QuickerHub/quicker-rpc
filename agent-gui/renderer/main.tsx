import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RootLayoutExtras } from "@/components/RootLayoutExtras";
import { AppBootstrapSplash } from "@/components/shell/AppBootstrapSplash";
import { ChatBootShell } from "@/components/shell/ChatBootShell";
import { parseActionDesignerEmbedFromSearchParams } from "@/lib/action-designer-embed";
import { DesignerEmbedProvider } from "@/lib/designer-embed-context";
import { LauncherLayoutClient } from "@/app/launcher/LauncherLayoutClient";
import { isToolTestSidebarTab } from "@/lib/tool-test-sidebar-prefs";
import "@/app/globals.css";
import "@/app/agent-workbench.css";
import "@/app/launcher/launcher-critical.css";

const Chat = lazy(() => import("@/components/chat/Chat").then((mod) => ({ default: mod.Chat })));
const Launcher = lazy(() => import("@/components/launcher/LauncherComposer").then((mod) => ({ default: mod.LauncherPanel })));
const Bench = lazy(() => import("@/components/bench/BenchChatPage").then((mod) => ({ default: mod.BenchChatPage })));
const ToolTest = lazy(() => import("@/components/tool-test/ToolTestPage").then((mod) => ({ default: mod.ToolTestPage })));
const Cursor = lazy(() => import("@/components/cursor-sdk/CursorSdkPage").then((mod) => ({ default: mod.CursorSdkPage })));

function Page() {
  const url = new URL(window.location.href);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  if (url.pathname === "/launcher") return <div className="launcher-route-shell"><LauncherLayoutClient><Launcher /></LauncherLayoutClient></div>;
  if (url.pathname === "/bench") return <Bench />;
  if (url.pathname === "/tool-test") {
    const tab = url.searchParams.get("tab");
    if (tab === "quickerbench") { window.location.replace(`/bench${url.search}`); return null; }
    return <ToolTest evalTab={tab && isToolTestSidebarTab(tab) ? tab : undefined} evalCwd={cwd} />;
  }
  if (url.pathname === "/cursor-sdk") return process.env.NODE_ENV === "development" ? <Cursor initialCwd={cwd} /> : <p>Not found</p>;
  return <DesignerEmbedProvider value={parseActionDesignerEmbedFromSearchParams(url.searchParams)}><Chat /></DesignerEmbedProvider>;
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppBootstrapSplash />
    <RootLayoutExtras />
    <Suspense fallback={<ChatBootShell />}><Page /></Suspense>
  </ThemeProvider>,
);
