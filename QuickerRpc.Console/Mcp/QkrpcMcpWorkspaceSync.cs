using System.Text.Json;
using System.Text.Json.Nodes;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpWorkspaceSync
{
    internal static async Task<string> AugmentActionGetAsync(
        QkrpcMcpRuntime runtime,
        string actionId,
        string getJson,
        CancellationToken cancellationToken)
    {
        if (!TryGetWorkspaceRoot(runtime, out var workspaceRoot))
        {
            return getJson;
        }

        if (!TryParseOk(getJson, out var root) || root is null)
        {
            return getJson;
        }

        if (!ProgramHasBody(root))
        {
            root["workspaceSync"] = new JsonObject
            {
                ["ok"] = false,
                ["reason"] = "empty_program",
                ["message"] =
                    "Action has no steps or variables; skipped extract to avoid writing an empty data.json.",
            };
            return root.ToJsonString();
        }

        var extractJson = await runtime.InvokeOpAsync(
            "action.extract",
            QkrpcMcpJson.ToElement(new { id = actionId, workspaceRoot }),
            cancellationToken).ConfigureAwait(false);

        if (TryParseOk(extractJson, out var extractRoot) && extractRoot is not null)
        {
            root["workspaceSync"] = new JsonObject
            {
                ["ok"] = true,
                ["action"] = "extract",
                ["payload"] = extractRoot["payload"]?.DeepClone(),
            };
        }
        else
        {
            root["workspaceSync"] = JsonNode.Parse(extractJson);
        }

        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        try
        {
            QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
        }
        catch
        {
            // non-fatal
        }

        return root.ToJsonString();
    }

    internal static async Task<string> AugmentActionCreateAsync(
        QkrpcMcpRuntime runtime,
        string createJson,
        CancellationToken cancellationToken)
    {
        if (!TryParseOk(createJson, out var root) || root is null)
        {
            return createJson;
        }

        var actionId = root["actionId"]?.GetValue<string>()
            ?? root["payload"]?["actionId"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return createJson;
        }

        if (!TryGetWorkspaceRoot(runtime, out var workspaceRoot))
        {
            return createJson;
        }

        var projectDir = ActionProjectCatalog.ResolveExtractProjectDirectory(
            actionId.Trim(),
            root["title"]?.GetValue<string>(),
            explicitDir: null,
            workspaceRoot);

        Directory.CreateDirectory(projectDir);
        Directory.CreateDirectory(Path.Combine(projectDir, QuickerProjectLayout.FilesDirName));

        var info = new ActionProjectInfo
        {
            Id = actionId.Trim(),
            Title = root["title"]?.GetValue<string>() ?? "新动作",
            Description = root["description"]?.GetValue<string>(),
            Icon = root["icon"]?.GetValue<string>(),
            EditVersion = root["editVersion"]?.GetValue<long>() ?? 0,
        };
        QuickerProjectFiles.WriteActionInfo(projectDir, info);

        if (!File.Exists(QuickerProjectLayout.GetDataPath(projectDir)))
        {
            QuickerProjectFiles.WriteData(projectDir, new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray(),
            });
        }

        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        try
        {
            QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
        }
        catch
        {
            // non-fatal
        }

        root["workspaceProject"] = new JsonObject
        {
            ["ok"] = true,
            ["projectDirectory"] = ActionProjectCatalog.GetRelativeProjectDirectory(projectDir, workspaceRoot),
            ["projectDirectoryAbsolute"] = projectDir,
        };

        await Task.CompletedTask.ConfigureAwait(false);
        return root.ToJsonString();
    }

    internal static async Task<string> AugmentSubprogramGetAsync(
        QkrpcMcpRuntime runtime,
        string subprogramId,
        string getJson,
        CancellationToken cancellationToken)
    {
        if (!TryGetWorkspaceRoot(runtime, out var workspaceRoot))
        {
            return getJson;
        }

        if (!TryParseOk(getJson, out var root) || root is null)
        {
            return getJson;
        }

        var dir = QkrpcMcpWorkspaceHelpers.ResolveGlobalSubProgramDir(workspaceRoot, subprogramId);
        var exportJson = await runtime.InvokeOpAsync(
            "subprogram.export",
            QkrpcMcpJson.ToElement(new { id = subprogramId, dir, workspaceRoot }),
            cancellationToken).ConfigureAwait(false);

        root["workspaceSync"] = JsonNode.Parse(exportJson);
        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        try
        {
            QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
        }
        catch
        {
            // non-fatal
        }

        return root.ToJsonString();
    }

    private static bool TryGetWorkspaceRoot(QkrpcMcpRuntime runtime, out string workspaceRoot)
    {
        workspaceRoot = string.Empty;
        if (string.IsNullOrWhiteSpace(runtime.WorkspaceRoot))
        {
            return false;
        }

        workspaceRoot = Path.GetFullPath(runtime.WorkspaceRoot);
        return true;
    }

    private static bool TryParseOk(string json, out JsonObject? root)
    {
        root = null;
        try
        {
            var node = JsonNode.Parse(json);
            if (node is not JsonObject obj)
            {
                return false;
            }

            root = obj;
            return obj["ok"]?.GetValue<bool>() ?? false;
        }
        catch
        {
            return false;
        }
    }

    private static bool ProgramHasBody(JsonObject root)
    {
        var payload = root["payload"] as JsonObject ?? root;
        if (payload["steps"] is JsonArray steps && steps.Count > 0)
        {
            return true;
        }

        if (payload["variables"] is JsonArray variables && variables.Count > 0)
        {
            return true;
        }

        var compressed = payload["compressedJson"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(compressed))
        {
            return false;
        }

        try
        {
            var inner = JsonNode.Parse(compressed) as JsonObject;
            if (inner?["steps"] is JsonArray innerSteps && innerSteps.Count > 0)
            {
                return true;
            }

            return inner?["variables"] is JsonArray innerVars && innerVars.Count > 0;
        }
        catch
        {
            return false;
        }
    }
}
