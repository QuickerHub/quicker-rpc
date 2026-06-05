import { tool } from "ai";
import { z } from "zod";
import {
  buildWorkspaceProjectSummary,
  parseQkrpcPayload,
} from "@/lib/action-project-workflow";
import { QKRPC_SUBPROGRAM_TOOL } from "@/lib/qkrpc-subprogram-tool";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
  runQkrpcWithProgramForTool,
} from "@/lib/qkrpc";
import { formatLocalToolResult } from "@/lib/tool-result";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

const actionSchema = z.enum([
  "list",
  "search",
  "get",
  "create",
  "patch",
  "replace",
  "export",
  "import",
  "edit",
  "edit_var",
]);

export type QkrpcSubprogramToolInput = {
  action: z.infer<typeof actionSchema>;
  query?: string;
  limit?: number;
  id?: string;
  returnMode?: z.infer<typeof returnModeSchema>;
  name?: string;
  description?: string;
  icon?: string;
  patch?: Record<string, unknown>;
  program?: Record<string, unknown>;
  expectedEditVersion?: number;
  force?: boolean;
  dir?: string;
  var?: string;
  value?: string;
};

export async function executeQkrpcSubprogramTool(
  input: QkrpcSubprogramToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "list": {
      const args = ["subprogram", "list"];
      if (input.query) args.push("--query", input.query);
      if (input.limit != null) args.push("--limit", String(input.limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "search": {
      if (!input.query?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "query is required for search",
        });
      }
      const args = ["subprogram", "search", "--query", input.query];
      if (input.limit != null) args.push("--limit", String(input.limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "get": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for get",
        });
      }
      const args = ["subprogram", "get", "--id", input.id];
      if (input.returnMode) args.push("--return-mode", input.returnMode);
      const getResult = await runQkrpcForTool(args);
      if (!getResult.ok) {
        return formatQkrpcResultForAgent(getResult);
      }
      const { augmentSubprogramGetWithWorkspace, syncSubprogramGetToWorkspace } =
        await import("@/lib/subprogram-project-workflow");
      const sync = await syncSubprogramGetToWorkspace(input.id, getResult);
      return augmentSubprogramGetWithWorkspace(getResult, sync);
    }
    case "create": {
      if (!input.name?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "name is required for create",
        });
      }
      const args = ["subprogram", "create", "--name", input.name];
      if (input.description) args.push("--description", input.description);
      if (input.icon) args.push("--icon", input.icon);
      const createResult = await runQkrpcForTool(args);
      if (!createResult.ok) {
        return formatQkrpcResultForAgent(createResult);
      }
      const payload = parseQkrpcPayload(createResult);
      const subProgramId =
        typeof payload?.subProgramId === "string"
          ? payload.subProgramId
          : undefined;
      if (!subProgramId) {
        return formatQkrpcResultForAgent(createResult);
      }
      const { bootstrapSubprogramProjectForCreate } = await import(
        "@/lib/subprogram-project-workflow"
      );
      const sync = await bootstrapSubprogramProjectForCreate(payload ?? {}, {
        description: input.description,
        icon: input.icon,
      });
      const editVersion =
        sync.ok && sync.manifest.editVersion != null
          ? sync.manifest.editVersion
          : typeof payload?.editVersion === "number"
            ? payload.editVersion
            : undefined;
      const callIdentifier =
        sync.ok && sync.manifest.callIdentifier
          ? sync.manifest.callIdentifier
          : typeof payload?.callIdentifier === "string"
            ? payload.callIdentifier
            : undefined;
      const base = {
        ...((payload ?? {}) as Record<string, unknown>),
        action: "subprogram-create",
        ok: true,
        subProgramId,
        name:
          sync.ok && sync.manifest.name
            ? sync.manifest.name
            : typeof payload?.name === "string"
              ? payload.name
              : input.name,
        callIdentifier,
        editVersion,
      };
      if (!sync.ok) {
        return formatLocalToolResult(
          {
            ...base,
            workspaceSynced: false,
            workspaceSyncError: sync.error,
            workspaceSyncReason: sync.reason,
            workspaceNote:
              sync.reason === "no_cwd"
                ? "Quicker 中已创建子程序，但未落盘：请先在侧栏设置工作目录，再重试 create 或手动 export。"
                : sync.reason === "invalid_create"
                  ? "Quicker 中已创建子程序，但 create 响应缺少 subProgramId，info.json 未写入。"
                  : sync.reason === "get_failed"
                    ? "Quicker 中已创建子程序，但 metadata get 失败，info.json 未写入完整标题。"
                    : "Quicker 中已创建子程序，但 info.json 未写入工作区。",
          },
          true,
        );
      }
      return formatLocalToolResult({
        ...base,
        workspaceSynced: true,
        workspaceProject: buildWorkspaceProjectSummary({
          projectDirectory: sync.manifest.projectDirectory,
          title: sync.manifest.name,
          editVersion: sync.manifest.editVersion,
          fileRefs: [],
        }),
        workspaceNote:
          "已用 metadata get 写入 info.json（含标题）与空 data.json。下一步在编辑器或 workspace_program({ action: \"edit_data\", target: \"global_subprogram\" }) 添加步骤，再 patch。",
      });
    }
    case "patch": {
      if (!input.id?.trim() || !input.patch) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id and patch are required for patch",
        });
      }
      const base = ["subprogram", "patch", "--id", input.id];
      if (input.expectedEditVersion != null) {
        base.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithPatchFileForTool(base, input.patch),
      );
    }
    case "replace": {
      if (!input.id?.trim() || !input.program) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id and program are required for replace",
        });
      }
      const base = ["subprogram", "replace", "--id", input.id];
      if (input.expectedEditVersion != null) {
        base.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithProgramForTool(base, input.program),
      );
    }
    case "export": {
      if (!input.id?.trim() || !input.dir?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id and dir are required for export",
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "export",
          "--id",
          input.id,
          "--dir",
          input.dir,
        ]),
      );
    }
    case "import": {
      if (!input.dir?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "dir is required for import",
        });
      }
      const args = ["subprogram", "import", "--dir", input.dir];
      if (input.expectedEditVersion != null) {
        args.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) args.push("--force");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "edit": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for edit",
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["subprogram", "edit", "--id", input.id]),
      );
    }
    case "edit_var": {
      if (!input.id?.trim() || !input.var || input.value == null) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id, var, and value are required for edit_var",
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "edit-var",
          "--id",
          input.id,
          "--var",
          input.var,
          "--value",
          input.value,
        ]),
      );
    }
    default:
      return formatQkrpcResultForAgent({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `Unknown action: ${String((input as { action?: string }).action)}`,
      });
  }
}

export const QKRPC_SUBPROGRAM_TOOL_DEF = tool({
  description:
    "Global subprograms: list/search/get/create/patch/replace/export/import/edit/edit_var. "
    + "get syncs .quicker/subprograms/ when program has body. create bootstraps info.json + data.json. "
    + "Prefer workspace_program for disk editing. Destructive delete: qkrpc_subprogram_delete.",
  inputSchema: z.object({
    action: actionSchema,
    query: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    id: z.string().optional(),
    returnMode: returnModeSchema.optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    patch: z.record(z.unknown()).optional(),
    program: z.record(z.unknown()).optional(),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
    dir: z.string().optional(),
    var: z.string().optional(),
    value: z.string().optional(),
  }),
  execute: async (input) => executeQkrpcSubprogramTool(input),
});

export { QKRPC_SUBPROGRAM_TOOL };
