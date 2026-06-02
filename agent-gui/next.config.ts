import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace from repo root so standalone build does not walk the runner profile (e.g. Documents).
  outputFileTracingRoot: path.join(agentGuiRoot, ".."),
  serverExternalPackages: ["@tauri-apps/api", "@tauri-apps/plugin-dialog"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
