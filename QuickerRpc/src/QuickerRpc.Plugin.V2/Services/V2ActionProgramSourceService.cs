using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Services;

/// <summary>Runs on Runtime's UI dispatcher; native storage handles the final compare-and-swap.</summary>
internal sealed class V2ActionProgramSourceService
{
    private readonly Func<QuickerV2SourceStorage?> _storage;
    internal V2ActionProgramSourceService(Func<QuickerV2SourceStorage?>? storage = null) =>
        _storage = storage ?? QuickerV2SourceStorage.TryCreate;
    internal bool IsAvailable => _storage() is not null;

    internal QuickerRpcGetActionProgramSourceResult Get(string actionId, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var id = actionId.Trim();
        try
        {
            if (!Guid.TryParse(id, out var guid)) return ReadFailure(id, "MISSING_ACTION_ID", "A local action GUID is required.");
            id = guid.ToString("D");
            var storage = _storage();
            if (storage is null) return ReadFailure(id, "UNSUPPORTED_HOST", "Native source requires V2 draft and catalog conditional storage APIs.");
            var snapshot = storage.Read(id);
            var presentation = QuickerV2SourceStorage.Field(snapshot.Document, "presentation") as JObject;
            var options = QuickerV2SourceStorage.Field(snapshot.Document, "options") as JObject;
            var result = new QuickerRpcGetActionProgramSourceResult
            {
                Success = true, ActionId = id, EditVersion = snapshot.Identity.Version, StorageIdentity = snapshot.Identity,
                BodyJson = snapshot.Body.ToString(Formatting.None), ReadSource = snapshot.Identity.Kind,
                Title = presentation is null ? null : QuickerV2SourceStorage.Field(presentation, "title")?.Value<string>(),
                Description = presentation is null ? null : QuickerV2SourceStorage.Field(presentation, "description")?.Value<string>(),
                Icon = presentation is null ? null : QuickerV2SourceStorage.Field(presentation, "icon")?.Value<string>(),
                ContextMenuData = options is null ? null : QuickerV2SourceStorage.Field(options, "contextMenuData")?.Value<string>(),
            };
            if (!storage.TryGetEditingState(id, out var editing, out var error)) result.Warnings.Add(error!);
            else if (editing) result.Warnings.Add("Action Designer is open. This is the persisted native body; close the designer and re-read before saving.");
            token.ThrowIfCancellationRequested();
            return result;
        }
        catch (OperationCanceledException) { throw; }
        catch (SourceStorageException ex) { return ReadFailure(id, ex.Code, ex.Message); }
        catch (Exception ex) { return ReadFailure(id, "SOURCE_READ_FAILED", QuickerV2SourceStorage.Message(ex)); }
    }

    internal QuickerRpcApplyXActionResult Apply(string actionId, string bodyJson, long? expectedVersion, bool force,
        QuickerRpcActionStorageIdentity? identity, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var id = actionId.Trim();
        QuickerV2SourceStorage? storage = null;
        JObject? submitted = null;
        QuickerV2SourceStorage.Snapshot? before = null;
        var committing = false;
        try
        {
            if (!Guid.TryParse(id, out var guid)) return Failure(id, "MISSING_ACTION_ID", "A local action GUID is required.");
            id = guid.ToString("D");
            storage = _storage();
            if (storage is null) return Failure(id, "UNSUPPORTED_HOST", "Native source requires V2 draft and catalog conditional storage APIs.");
            // Force never bypasses an open or unknown Designer state.
            if (!storage.TryGetEditingState(id, out var editing, out var error)) return Failure(id, "DESIGNER_STATE_UNAVAILABLE", error!);
            if (editing) return Failure(id, "DESIGNER_OPEN", "Close Action Designer and re-read before saving.");
            if (identity is null) return Failure(id, "STORAGE_IDENTITY_REQUIRED", "Reopen the source to obtain its native storage identity.");
            if (identity.Kind is not ("catalog" or "draft") || identity.Version != expectedVersion
                || (identity.Kind == "catalog" && !string.IsNullOrEmpty(identity.DraftId))
                || (identity.Kind == "draft" && string.IsNullOrWhiteSpace(identity.DraftId)))
                return Failure(id, "STORAGE_IDENTITY_MISMATCH", "The source storage identity and edit version do not match. Reopen the source.");
            before = storage.Read(id);
            if (!QuickerV2SourceStorage.SameIdentity(identity, before.Identity))
                return Failure(id, "STORAGE_IDENTITY_MISMATCH", "Action storage identity changed. Reopen the source.");
            if (!force && expectedVersion != before.Identity.Version)
                return Conflict(id, before.Identity);
            if (!force && identity.ContentHash != before.Identity.ContentHash)
                return Conflict(id, before.Identity);
            if (QuickerV2SourceStorage.Field(before.Document, "userLimitation") is { Type: not JTokenType.Null } limitation
                && limitation.Value<int>() >= 2)
                return Failure(id, "ACTION_READ_ONLY", "The native action is read-only.");

            var parsed = NativeActionProgramSourceBody.Parse(bodyJson);
            try { submitted = NativeActionProgramSourceBody.Parse(NativeActionProgramSourceBody.Merge(before.Body, parsed)); }
            catch (InvalidOperationException ex) { return Failure(id, "SOURCE_FIELD_READ_ONLY", ex.Message); }
            // Reuse the shared lossless codec; V2 DTOs use the same native field map, not Agent compression.
            var wire = V1ProgramSourceCodec.FromNative(submitted);
            ProgramSourceCodec.RequireLosslessRoundtrip(wire);
            storage.Validate(submitted);
            token.ThrowIfCancellationRequested();
            if (!storage.TryGetEditingState(id, out editing, out error)) return Failure(id, "DESIGNER_STATE_UNAVAILABLE", error!);
            if (editing) return Failure(id, "DESIGNER_OPEN", "Action Designer opened before commit. Close it and re-read.");
            var commit = storage.Commit(before, submitted, token, () => committing = true);
            var result = new QuickerRpcApplyXActionResult
            {
                Success = commit.Success, Persisted = commit.Persisted, ActionId = id,
                EditVersion = commit.Identity.Version, StorageIdentity = commit.Identity,
                VersionConflict = commit.ErrorCode == "VERSION_CONFLICT", ErrorCode = commit.ErrorCode, ErrorMessage = commit.Error,
                UpdatedUtc = commit.Persisted ? DateTimeOffset.UtcNow.ToString("O") : null,
            };
            if (!commit.Persisted) return result;
            // Once committed, cancellation cannot turn the result into an unqualified canceled write.
            try
            {
                var reloaded = storage.Read(id);
                if (!QuickerV2SourceStorage.SameIdentity(commit.Identity, reloaded.Identity)
                    || reloaded.Identity.Version != commit.Identity.Version || !JToken.DeepEquals(submitted, reloaded.Body))
                    throw new InvalidOperationException("Stored body or version changed before readback. Reopen before saving again.");
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorCode = "SOURCE_READBACK_FAILED";
                result.ErrorMessage = "Native storage committed; readback failed: " + QuickerV2SourceStorage.Message(ex);
            }
            if (token.IsCancellationRequested) result.Warnings.Add("Cancellation arrived after native storage committed.");
            return result;
        }
        catch (OperationCanceledException) when (!committing) { throw; }
        catch (SourceStorageException ex) when (!committing) { return Failure(id, ex.Code, ex.Message); }
        catch (Exception ex) when (committing)
        {
            // Repositories can commit and then throw from a notification. Do not replay that write.
            var result = Failure(id, "SOURCE_WRITE_RESULT_UNKNOWN", "Native write result is uncertain; reopen before saving again. " + QuickerV2SourceStorage.Message(ex));
            result.Persisted = null;
            try
            {
                var after = storage!.Read(id);
                if (before is not null && QuickerV2SourceStorage.SameIdentity(before.Identity, after.Identity)
                    && after.Identity.Version != before.Identity.Version && JToken.DeepEquals(submitted, after.Body))
                {
                    result.Persisted = true;
                    result.ErrorCode = "SOURCE_POST_COMMIT_FAILED";
                    result.StorageIdentity = after.Identity;
                    result.EditVersion = after.Identity.Version;
                }
            }
            catch (Exception) { /* Unknown remains explicit. */ }
            return result;
        }
        catch (Exception ex) when (ex is JsonException or ProgramSourceException or FormatException or OverflowException)
        { return Failure(id, "INVALID_PROGRAM", QuickerV2SourceStorage.Message(ex)); }
        catch (Exception ex) { return Failure(id, "SOURCE_SAVE_FAILED", QuickerV2SourceStorage.Message(ex)); }
    }

    private static QuickerRpcGetActionProgramSourceResult ReadFailure(string id, string code, string message) =>
        new() { ActionId = id, ErrorCode = code, ErrorMessage = message };
    private static QuickerRpcApplyXActionResult Failure(string id, string code, string message) =>
        new() { ActionId = id, ErrorCode = code, ErrorMessage = message, Persisted = false };
    private static QuickerRpcApplyXActionResult Conflict(string id, QuickerRpcActionStorageIdentity identity) =>
        new() { ActionId = id, ErrorCode = "VERSION_CONFLICT", ErrorMessage = "Native action changed. Reopen the source.",
            EditVersion = identity.Version, StorageIdentity = identity, VersionConflict = true, Persisted = false };
}
