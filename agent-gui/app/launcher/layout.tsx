import "./launcher-critical.css";
import { LAUNCHER_SHELL_INIT_SCRIPT } from "@/lib/launcher/launcher-shell-init";
import { LauncherLayoutClient } from "./LauncherLayoutClient";

export default function LauncherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: LAUNCHER_SHELL_INIT_SCRIPT }} />
      <div className="launcher-route-shell">
        <LauncherLayoutClient>{children}</LauncherLayoutClient>
      </div>
    </>
  );
}
