using System.Text.Json;
using System.Text.Json.Nodes;

namespace QuickerRpc.Console.Mcp;

/// <summary>
/// MCP tool output shaping: flatten serve envelopes and drop agent-noise fields.
/// Set QKRPC_MCP_VERBOSE=1 to emit the legacy verbose JSON (double envelope + boilerplate).
/// </summary>
internal static class QkrpcMcpResponseCompact
{
    private const string VerboseEnvVar = "QKRPC_MCP_VERBOSE";

    public static bool IsVerboseEnabled =>
        string.Equals(Environment.GetEnvironmentVariable(VerboseEnvVar), "1", StringComparison.Ordinal)
        || string.Equals(Environment.GetEnvironmentVariable(VerboseEnvVar), "true", StringComparison.OrdinalIgnoreCase);

    public static string Compact(string json)
    {
        if (IsVerboseEnabled || string.IsNullOrWhiteSpace(json))
        {
            return json;
        }

        try
        {
            var node = JsonNode.Parse(json);
            if (node is not JsonObject root)
            {
                return json;
            }

            var compacted = CompactObject(root);
            return compacted?.ToJsonString(QkrpcMcpJson.SerializerOptions) ?? json;
        }
        catch (JsonException)
        {
            return json;
        }
    }

    internal static JsonObject? CompactWorkspaceSyncNode(JsonNode? syncNode)
    {
        if (syncNode is not JsonObject sync)
        {
            return syncNode as JsonObject;
        }

        if (sync["ok"]?.GetValue<bool>() != true)
        {
            return sync;
        }

        var payload = ResolvePayloadObject(sync);
        if (payload is null)
        {
            return sync;
        }

        var compact = new JsonObject { ["ok"] = true };

        var projectDir = FirstNonEmptyString(payload, "projectDirectory", "projectDir");
        if (!string.IsNullOrWhiteSpace(projectDir))
        {
            compact["projectDir"] = projectDir;
        }

        CopyIfPresent(payload, compact, "editVersion");
        CopyIfPresent(payload, compact, "actionId");
        CopyIfPresent(payload, compact, "subProgramId");
        CopyIfPresent(payload, compact, "callIdentifier");

        if (payload["warnings"] is JsonArray warnings && warnings.Count > 0)
        {
            compact["warnings"] = warnings.DeepClone();
        }

        return compact;
    }

    private static JsonObject? CompactObject(JsonObject root)
    {
        if (root.ContainsKey("workspaceSync"))
        {
            root["workspaceSync"] = CompactWorkspaceSyncNode(root["workspaceSync"]);
        }

        if (root.ContainsKey("workspaceProject"))
        {
            root["workspaceProject"] = CompactWorkspaceProjectNode(root["workspaceProject"]);
        }

        // Validation errors from executors: { ok:false, errorMessage }
        if (root["ok"]?.GetValue<bool>() == false && root.ContainsKey("errorMessage"))
        {
            return root;
        }

        // Serve envelope: { ok, data?, error?, message? }
        if (root["data"] is JsonObject data)
        {
            var outerOk = root["ok"]?.GetValue<bool>() ?? false;
            if (!outerOk)
            {
                var failed = new JsonObject
                {
                    ["ok"] = false,
                    ["error"] = root["error"]?.DeepClone(),
                    ["message"] = root["message"]?.DeepClone(),
                };
                CopyIfPresent(data, failed, "persistedParts");
                CopyIfPresent(data, failed, "projectDirectoryAbsolute");
                CopyIfPresent(root, failed, "hostBinding");
                return failed;
            }

            var flat = FlattenServeData(data, outerOk);
            if (root["hostBinding"] is JsonObject binding) flat["hostBinding"] = binding.DeepClone();
            return flat;
        }

        // Already flat (workspace_program, post-augment get, etc.)
        return TrimPayloadBoilerplate(root);
    }

    private static JsonObject FlattenServeData(JsonObject data, bool outerOk)
    {
        var action = data["action"]?.GetValue<string>();
        var payload = data["payload"] as JsonObject;

        if (payload is not null && !string.IsNullOrWhiteSpace(action))
        {
            var flat = new JsonObject
            {
                ["ok"] = outerOk,
                ["action"] = action,
            };

            foreach (var prop in payload)
            {
                flat[prop.Key] = prop.Value?.DeepClone();
            }

            return TrimPayloadBoilerplate(flat);
        }

        var merged = new JsonObject { ["ok"] = outerOk };
        foreach (var prop in data)
        {
            if (prop.Key.Equals("ok", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            merged[prop.Key] = prop.Value?.DeepClone();
        }

        return TrimPayloadBoilerplate(merged);
    }

    private static JsonObject TrimPayloadBoilerplate(JsonObject obj)
    {
        RemoveIfDefaultSuccess(obj);
        RemoveIfNullOrEmpty(obj, "errorMessage");
        RemoveIfNullOrEmpty(obj, "errorCode");

        if (obj["readOnly"]?.GetValue<bool>() == false)
        {
            obj.Remove("readOnly");
            obj.Remove("readOnlyReason");
        }

        if (obj["patchAllowed"]?.GetValue<bool>() == true)
        {
            obj.Remove("patchAllowed");
        }

        if (obj["omitDefaultLiteralInputsApplied"]?.GetValue<bool>() == true)
        {
            obj.Remove("omitDefaultLiteralInputsApplied");
        }

        if (obj["subProgramCount"]?.GetValue<int>() == 0)
        {
            obj.Remove("subProgramCount");
        }

        var readSource = obj["readSource"]?.GetValue<string>();
        if (!string.Equals(readSource, "action-designer", StringComparison.OrdinalIgnoreCase))
        {
            obj.Remove("readSource");
        }

        obj.Remove("returnMode");

        if (obj["action"]?.GetValue<string>() is { } action
            && action is "list" or "search")
        {
            TrimListPayload(obj);
        }

        if (obj["schema"] is JsonObject schema)
        {
            TrimStepRunnerSchema(schema);
        }

        return obj;
    }

    private static void RemoveIfDefaultSuccess(JsonObject obj)
    {
        if (obj["ok"]?.GetValue<bool>() == true && obj["success"]?.GetValue<bool>() == true)
        {
            obj.Remove("success");
        }
    }

    private static void RemoveIfNullOrEmpty(JsonObject obj, string key)
    {
        if (!obj.TryGetPropertyValue(key, out var value) || value is null)
        {
            obj.Remove(key);
            return;
        }

        if (value is JsonValue jv && jv.TryGetValue<string>(out var text) && string.IsNullOrWhiteSpace(text))
        {
            obj.Remove(key);
        }
    }

    private static void TrimListPayload(JsonObject obj)
    {
        RemoveIfNullOrEmpty(obj, "errorMessage");
        RemoveIfDefaultSuccess(obj);

        if (obj["scope"]?.GetValue<string>() is { Length: 0 })
        {
            obj.Remove("scope");
        }

        if (obj["items"] is not JsonArray items)
        {
            return;
        }

        foreach (var item in items)
        {
            if (item is not JsonObject row)
            {
                continue;
            }

            TrimSummaryItem(row);
        }
    }

    private static void TrimSummaryItem(JsonObject row)
    {
        foreach (var key in row.Select(p => p.Key).ToList())
        {
            if (row[key] is JsonValue jv && jv.TryGetValue<string>(out var text) && string.IsNullOrEmpty(text))
            {
                row.Remove(key);
                continue;
            }

            if (row[key] is JsonValue num && num.TryGetValue<double>(out var score) && Math.Abs(score) < 0.0001)
            {
                row.Remove(key);
            }
        }
    }

    private static void TrimStepRunnerSchema(JsonObject schema)
    {
        // success/errorMessage live on the outer object; schema body is already agent-compressed.
        schema.Remove("icon");
    }

    private static JsonObject? CompactWorkspaceProjectNode(JsonNode? node)
    {
        if (node is not JsonObject project)
        {
            return node as JsonObject;
        }

        if (project["ok"]?.GetValue<bool>() != true)
        {
            return project;
        }

        var compact = new JsonObject { ["ok"] = true };
        var rel = FirstNonEmptyString(project, "projectDirectory", "projectDir");
        if (!string.IsNullOrWhiteSpace(rel))
        {
            compact["projectDir"] = rel;
        }

        return compact;
    }

    private static JsonObject? ResolvePayloadObject(JsonObject sync)
    {
        if (sync["payload"] is JsonObject direct)
        {
            return direct;
        }

        if (sync["data"] is JsonObject data && data["payload"] is JsonObject nested)
        {
            return nested;
        }

        return sync;
    }

    private static string? FirstNonEmptyString(JsonObject obj, params string[] keys)
    {
        foreach (var key in keys)
        {
            var value = obj[key]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static void CopyIfPresent(JsonObject source, JsonObject target, string key)
    {
        if (source[key] is not null)
        {
            target[key] = source[key]!.DeepClone();
        }
    }
}
