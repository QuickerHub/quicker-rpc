using System.Text.Json;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>One source workflow shared by CLI, MCP and HTTP.</summary>
internal static class ActionSourceServeOps
{
    internal static async Task<ServeInvokeResponse> OpenAsync(IQuickerRpcService rpc, JsonElement args, CancellationToken token)
    {
        try
        {
            var id = ServeJsonArgs.GetString(args, "id")?.Trim();
            var dir = ResolveDirectory(args);
            if (!Guid.TryParse(id, out _) || string.IsNullOrWhiteSpace(dir))
                return Fail("INVALID_ARGS", "Provide id (local action GUID) and dir (empty directory).");
            var result = await rpc.GetActionProgramSourceAsync(id, token).ConfigureAwait(false);
            if (!result.Success || string.IsNullOrWhiteSpace(result.BodyJson) || !result.EditVersion.HasValue)
                return Fail(result.ErrorCode ?? "SOURCE_READ_FAILED", result.ErrorMessage ?? "Native action source is unavailable.");
            var output = ActionSourceWorkspace.Open(dir, result.ActionId ?? id, result.EditVersion.Value, result.Title, result.ReadSource,
                LosslessProgramJson.ParseObject(result.BodyJson), ServeJsonArgs.GetInt(args, "minLines") ?? 4,
                ServeJsonArgs.GetBool(args, "noAutoFiles"), result.Warnings, result.StorageIdentity);
            return new ServeInvokeResponse { Ok = true, Data = output };
        }
        catch (ProgramSourceException ex) { return Fail(ex.Code, ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException or Newtonsoft.Json.JsonException)
        { return Fail("SOURCE_OPEN_FAILED", ex.Message); }
    }

    internal static async Task<ServeInvokeResponse> SaveAsync(IQuickerRpcService? rpc, JsonElement args, CancellationToken token)
    {
        try
        {
            var dir = ResolveDirectory(args);
            if (string.IsNullOrWhiteSpace(dir)) return Fail("INVALID_ARGS", "dir is required.");
            var prepared = ActionSourceWorkspace.Prepare(dir);
            var dryRun = ServeJsonArgs.GetBool(args, "dryRun");
            if (dryRun)
                return new ServeInvokeResponse { Ok = true, Data = new
                {
                    ok = true, dryRun = true, prepared.ActionId, prepared.EditVersion,
                    projectDirectoryAbsolute = prepared.Directory,
                    stepCount = ActionSourceWorkspace.ProgramArray(prepared.Body, "Steps").Count,
                    variableCount = ActionSourceWorkspace.ProgramArray(prepared.Body, "Variables").Count,
                }};
            if (rpc is null) throw new InvalidOperationException("A live host is required to save.");
            // Submit only the editable body; metadata may have been refreshed by the host on the previous save.
            var body = new JObject
            {
                ["Steps"] = ActionSourceWorkspace.ProgramArray(prepared.Body, "Steps").DeepClone(),
                ["Variables"] = ActionSourceWorkspace.ProgramArray(prepared.Body, "Variables").DeepClone(),
                ["SubPrograms"] = ActionSourceWorkspace.ProgramArray(prepared.Body, "SubPrograms").DeepClone(),
            };
            // Select the protocol from the opened bundle, before writing. Never downgrade/retry an identity-bound write.
            var result = prepared.StorageIdentity is { } storage
                ? await rpc.ApplyActionProgramSourceWithStorageAsync(prepared.ActionId,
                    body.ToString(Formatting.None), storage, prepared.EditVersion, false, token).ConfigureAwait(false)
                : await rpc.ApplyActionProgramSourceAsync(prepared.ActionId,
                    body.ToString(Formatting.None), prepared.EditVersion, false, token).ConfigureAwait(false);
            if (!result.Success)
                return new ServeInvokeResponse { Ok = false, Error = result.ErrorCode ?? "SOURCE_SAVE_FAILED",
                    Message = result.ErrorMessage, Data = new { result.VersionConflict, result.Persisted, result.ActionId,
                        result.EditVersion, result.StorageIdentity, result.Warnings } };
            try
            {
                if (!result.EditVersion.HasValue) throw new InvalidOperationException("Host omitted the saved edit version.");
                if (prepared.StorageIdentity is not null && result.StorageIdentity is null)
                    throw new InvalidOperationException("Host omitted the saved native storage identity.");
                ActionSourceWorkspace.Checkpoint(prepared, result.EditVersion.Value, result.StorageIdentity);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                return new ServeInvokeResponse { Ok = false, Error = "SOURCE_CHECKPOINT_FAILED",
                    Message = "The action was saved, but its local checkpoint could not be updated. Reopen into a new directory before saving again. " + ex.Message,
                    Data = new { persisted = true, result.ActionId, result.EditVersion } };
            }
            return new ServeInvokeResponse { Ok = true, Data = new
            {
                ok = true, dryRun = false, persisted = true, result.ActionId, result.EditVersion,
                projectDirectoryAbsolute = prepared.Directory, result.Warnings,
            }};
        }
        catch (ProgramSourceException ex) { return Fail(ex.Code, ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException or Newtonsoft.Json.JsonException)
        { return Fail("SOURCE_SAVE_FAILED", ex.Message); }
    }

    private static ServeInvokeResponse Fail(string code, string message) => new() { Ok = false, Error = code, Message = message };

    internal static string? ResolveDirectory(JsonElement args)
    {
        var dir = ServeJsonArgs.GetString(args, "dir");
        if (string.IsNullOrWhiteSpace(dir) || Path.IsPathFullyQualified(dir)) return dir;
        var root = ServeJsonArgs.GetString(args, "workspaceRoot");
        return string.IsNullOrWhiteSpace(root) ? Path.GetFullPath(dir) : Path.GetFullPath(dir, Path.GetFullPath(root));
    }
}
