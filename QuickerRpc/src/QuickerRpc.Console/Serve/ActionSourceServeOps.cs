using System.Text.Json;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>One source workflow shared by CLI, MCP and HTTP.</summary>
internal static class ActionSourceServeOps
{
    internal static ServeInvokeResponse Document(JsonElement args, CancellationToken token)
    {
        try
        {
            token.ThrowIfCancellationRequested();
            if (args.ValueKind != JsonValueKind.Object) return Fail("INVALID_ARGS", "source.document args must be an object.");
            foreach (var name in new[] { "dir", "workspaceRoot", "mode", "expectedSnapshot", "editorJson", "baselineEditorJson" })
                if (args.TryGetProperty(name, out var value) && value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
                    return Fail("INVALID_ARGS", $"{name} must be a string or null.");
            var dir = ResolveDirectory(args);
            if (string.IsNullOrWhiteSpace(dir)) return Fail("INVALID_ARGS", "dir is required.");
            JArray? resources = null;
            if (args.TryGetProperty("resources", out var resourceJson) && resourceJson.ValueKind != JsonValueKind.Null)
            {
                if (resourceJson.ValueKind != JsonValueKind.Array) return Fail("INVALID_ARGS", "resources must be an array.");
                resources = JArray.Parse(resourceJson.GetRawText());
            }
            var document = ActionSourceWorkspace.Document(dir, OptionalString(args, "mode") ?? "inspect",
                ExpectedSnapshot(args), OptionalString(args, "editorJson"), resources, token, OptionalString(args, "baselineEditorJson"));
            using var json = JsonDocument.Parse(document.ToString(Formatting.None));
            return new ServeInvokeResponse { Ok = true, Data = json.RootElement.Clone() };
        }
        catch (SourceDocumentWriteException ex)
        {
            return new ServeInvokeResponse { Ok = false, Error = "SOURCE_DOCUMENT_PARTIAL", Message = ex.Message,
                Data = new { writtenFiles = ex.WrittenFiles, failedFile = ex.FailedFile, baselineAdvanced = false } };
        }
        catch (QuickerRpcClientException ex) { return Fail(ex.ErrorCode, ex.Message); }
        catch (ProgramSourceException ex) { return Fail(ex.Code, ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException or Newtonsoft.Json.JsonException)
        { return Fail("SOURCE_DOCUMENT_FAILED", ex.Message); }
    }

    internal static async Task<ServeInvokeResponse> OpenAsync(IQuickerRpcService rpc, JsonElement args, CancellationToken token)
    {
        try
        {
            var id = ServeJsonArgs.GetString(args, "id")?.Trim();
            var dir = ResolveDirectory(args);
            if (!Guid.TryParse(id, out _) || string.IsNullOrWhiteSpace(dir))
                return Fail("INVALID_ARGS", "Provide id (local action GUID) and dir (empty directory).");
            var binding = QuickerRpcClient.GetBinding(rpc);
            if (binding is null) return Fail(QuickerRpcBindingErrors.Required, "Source export requires a verified host binding. Upgrade the plugin.");
            var result = await rpc.GetActionProgramSourceAsync(id, token).ConfigureAwait(false);
            if (!result.Success || string.IsNullOrWhiteSpace(result.BodyJson) || !result.EditVersion.HasValue)
                return Fail(result.ErrorCode ?? "SOURCE_READ_FAILED", result.ErrorMessage ?? "Native action source is unavailable.");
            var output = ActionSourceWorkspace.Open(dir, result.ActionId ?? id, result.EditVersion.Value, result.Title, result.ReadSource,
                LosslessProgramJson.ParseObject(result.BodyJson), ServeJsonArgs.GetInt(args, "minLines") ?? 4,
                ServeJsonArgs.GetBool(args, "noAutoFiles"), result.Warnings,
                hostBinding: binding, storageIdentity: result.StorageIdentity);
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
            token.ThrowIfCancellationRequested();
            var prepared = ActionSourceWorkspace.Prepare(dir, ExpectedSnapshot(args));
            return await SavePreparedAsync(rpc, args, prepared, token).ConfigureAwait(false);
        }
        catch (ProgramSourceException ex) { return Fail(ex.Code, ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException or Newtonsoft.Json.JsonException)
        { return Fail("SOURCE_SAVE_FAILED", ex.Message); }
    }

    internal static async Task<ServeInvokeResponse> SavePreparedAsync(IQuickerRpcService? rpc, JsonElement args,
        ActionSourceWorkspace.Prepared prepared, CancellationToken token)
    {
        try
        {
            token.ThrowIfCancellationRequested();
            var dryRun = ServeJsonArgs.GetBool(args, "dryRun");
            if (dryRun)
                return new ServeInvokeResponse { Ok = true, Data = new
                {
                    ok = true, dryRun = true, prepared.ActionId, prepared.EditVersion, hostBinding = prepared.HostBinding,
                    consumedSnapshot = prepared.SnapshotRevision, consumedBodyHash = prepared.ConsumedBodyHash,
                    hostSaveStatus = "not-attempted", checkpointStatus = "not-attempted",
                    projectDirectoryAbsolute = prepared.Directory,
                    stepCount = ActionSourceWorkspace.ProgramArray(prepared.Body, "Steps").Count,
                    variableCount = ActionSourceWorkspace.ProgramArray(prepared.Body, "Variables").Count,
                }};
            if (rpc is null) throw new InvalidOperationException("A live host is required to save.");
            if (prepared.HostBinding is null) return Fail(QuickerRpcBindingErrors.Required, "This bundle has no verified host binding. Reopen explicitly before saving.");
            QuickerRpcClient.RequireBinding(rpc, prepared.HostBinding);
            // The same captured bytes select the connection, write body and checkpoint.
            // Source edits made while connecting belong to the next save.
            ActionSourceWorkspace.AssertManagedUnchanged(prepared);
            token.ThrowIfCancellationRequested();
            // Select the protocol from the opened bundle, before writing. Never downgrade/retry an identity-bound write.
            var result = prepared.StorageIdentity is { } storage
                ? await rpc.ApplyActionProgramSourceWithStorageAsync(prepared.ActionId,
                    prepared.EditableBodyJson, storage, prepared.EditVersion, false, token).ConfigureAwait(false)
                : await rpc.ApplyActionProgramSourceAsync(prepared.ActionId,
                    prepared.EditableBodyJson, prepared.EditVersion, false, token).ConfigureAwait(false);
            if (!result.Success)
                return new ServeInvokeResponse { Ok = false, Error = result.ErrorCode ?? "SOURCE_SAVE_FAILED",
                    Message = result.ErrorMessage, Data = UnconfirmedReceipt(prepared, result) };
            var invalidAck = ValidateSaveAcknowledgement(prepared, result);
            if (invalidAck is not null)
                return new ServeInvokeResponse { Ok = false, Error = "SOURCE_SAVE_ACK_INVALID",
                    Message = invalidAck + " No local checkpoint was advanced; do not replay the write.",
                    Data = UnconfirmedReceipt(prepared, result) };
            try
            {
                ActionSourceWorkspace.Checkpoint(prepared, result.EditVersion!.Value, result.StorageIdentity);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException
                or ProgramSourceException or QuickerRpcClientException or Newtonsoft.Json.JsonException)
            {
                return new ServeInvokeResponse { Ok = false, Error = "SOURCE_CHECKPOINT_FAILED",
                    Message = "The action was saved, but its local checkpoint could not be updated. Reopen into a new directory before saving again. " + ex.Message,
                    Data = System.Text.Json.JsonSerializer.SerializeToElement(new { persisted = true, result.ActionId, result.EditVersion, result.StorageIdentity, result.Warnings,
                        consumedSnapshot = prepared.SnapshotRevision, consumedBodyHash = prepared.ConsumedBodyHash,
                        hostSaveStatus = "confirmed", checkpointStatus = "failed" }, ReceiptJson) };
            }
            return new ServeInvokeResponse { Ok = true, Data = System.Text.Json.JsonSerializer.SerializeToElement(new
            {
                ok = true, dryRun = false, persisted = true, result.ActionId, result.EditVersion, hostBinding = prepared.HostBinding,
                projectDirectoryAbsolute = prepared.Directory, result.Warnings,
                result.StorageIdentity,
                consumedSnapshot = prepared.SnapshotRevision, consumedBodyHash = prepared.ConsumedBodyHash,
                hostSaveStatus = "confirmed", checkpointStatus = "updated",
            }, ReceiptJson) };
        }
        catch (QuickerRpcClientException ex) when (ex.ErrorCode == QuickerRpcBindingErrors.UnknownWriteResult)
        {
            return new ServeInvokeResponse { Ok = false, Error = ex.ErrorCode, Message = ex.Message,
                HostBinding = prepared.HostBinding,
                Data = System.Text.Json.JsonSerializer.SerializeToElement(new { prepared.ActionId, prepared.EditVersion,
                    persisted = (bool?)null,
                    consumedSnapshot = prepared.SnapshotRevision, consumedBodyHash = prepared.ConsumedBodyHash,
                    hostSaveStatus = "unknown", checkpointStatus = "not-attempted" },
                    ReceiptJson) };
        }
        catch (ProgramSourceException ex) { return Fail(ex.Code, ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException or Newtonsoft.Json.JsonException)
        { return Fail("SOURCE_SAVE_FAILED", ex.Message); }
    }

    private static ServeInvokeResponse Fail(string code, string message) => new() { Ok = false, Error = code, Message = message };
    private static readonly JsonSerializerOptions ReceiptJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static JsonElement UnconfirmedReceipt(ActionSourceWorkspace.Prepared prepared, QuickerRpcApplyXActionResult result) =>
        System.Text.Json.JsonSerializer.SerializeToElement(new { result.VersionConflict, result.Persisted, result.ActionId,
            result.EditVersion, result.StorageIdentity, result.Warnings,
            consumedSnapshot = prepared.SnapshotRevision, consumedBodyHash = prepared.ConsumedBodyHash,
            hostSaveStatus = result.Persisted switch { true => "persisted-unconfirmed", false => "rejected", null => "unknown" },
            checkpointStatus = "not-attempted" }, ReceiptJson);

    private static string? ValidateSaveAcknowledgement(ActionSourceWorkspace.Prepared prepared, QuickerRpcApplyXActionResult result)
    {
        if (result.Persisted != true) return "Host success did not confirm persistence.";
        if (!string.Equals(result.ActionId, prepared.ActionId, StringComparison.OrdinalIgnoreCase))
            return "Host success did not acknowledge the consumed action identity.";
        if (!result.EditVersion.HasValue) return "Host omitted the saved edit version.";
        if (prepared.StorageIdentity is not null && result.StorageIdentity is null)
            return "Host omitted the saved native storage identity.";
        if (result.StorageIdentity is { } storage
            && (storage.Version != result.EditVersion.Value || storage.Kind is not ("catalog" or "draft")
                || (storage.Kind == "catalog" && !string.IsNullOrEmpty(storage.DraftId))
                || (storage.Kind == "draft" && string.IsNullOrWhiteSpace(storage.DraftId))
                || (prepared.StorageIdentity is { } old && (old.Kind != storage.Kind || old.DraftId != storage.DraftId))))
            return "Host acknowledged a different or invalid native storage identity.";
        return null;
    }

    internal static string? ExpectedSnapshot(JsonElement args) => OptionalString(args, "expectedSnapshot");

    private static string? OptionalString(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind != JsonValueKind.String) throw new ProgramSourceException("INVALID_ARGS", $"{name} must be a string or null.");
        return value.GetString(); // Empty/whitespace is supplied data, never permission to skip CAS.
    }

    internal static string? ResolveDirectory(JsonElement args)
    {
        var dir = ServeJsonArgs.GetString(args, "dir");
        if (string.IsNullOrWhiteSpace(dir) || Path.IsPathFullyQualified(dir)) return dir;
        var root = ServeJsonArgs.GetString(args, "workspaceRoot");
        return string.IsNullOrWhiteSpace(root) ? Path.GetFullPath(dir) : Path.GetFullPath(dir, Path.GetFullPath(root));
    }
}
