import { tool } from "ai";
import { z } from "zod";
import {
  clearClientFrontendErrors,
  clearFrontendBuildError,
} from "@/lib/dev-frontend-error-store.server";
import { runFrontendSmokeCheck } from "@/lib/dev-frontend-smoke.server";
import { formatLocalToolResult } from "@/lib/tool-result";

export const DEV_FRONTEND_CHECK_TOOL = "dev_frontend_check";

export const DEV_FRONTEND_CHECK_TOOL_DEF = tool({
  description:
    "Check agent-gui frontend health in local dev: HTTP status, Next.js compile/runtime "
    + "errors from page HTML, dev-server build log (.local/frontend-build-error.json), "
    + "and browser-captured errors (.local/frontend-client-errors.json). "
    + "After editing agent-gui UI, call until ok=true. Use clearCaptured=true only after a successful render.",
  inputSchema: z.object({
    baseUrl: z
      .string()
      .optional()
      .describe("Override dev server URL; default reads .local/dev-server.json or PORT"),
    clearCaptured: z
      .boolean()
      .optional()
      .describe("Clear stored client/build error snapshots after a successful check"),
    paths: z
      .array(z.string())
      .optional()
      .describe('Extra paths to probe (default ["/", "/api/llm", "/api/ping"])'),
  }),
  execute: async ({ baseUrl, clearCaptured, paths }) => {
    if (process.env.NODE_ENV === "production") {
      return formatLocalToolResult(
        {
          action: "dev-frontend-check",
          errorMessage: "dev_frontend_check is only available in development",
        },
        false,
        "Not available in production",
      );
    }

    const result = await runFrontendSmokeCheck({ baseUrl, paths });
    if (result.ok && clearCaptured) {
      clearClientFrontendErrors();
      clearFrontendBuildError();
    }

    const summary = result.ok
      ? `Frontend OK at ${result.url}`
      : `${result.issues.length} issue(s) at ${result.url}`;

    return formatLocalToolResult(
      {
        action: "dev-frontend-check",
        success: result.ok,
        summary,
        ...result,
        hint: result.ok
          ? undefined
          : "Fix agent-gui source, wait for Next dev recompile, then call dev_frontend_check again until ok=true.",
      },
      result.ok,
      result.ok ? undefined : summary,
    );
  },
});
