using System.Threading;
using System.Threading.Tasks;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    public Task<QuickerRpcGetActionProgramSourceResult> GetActionProgramSourceAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcGetActionProgramSourceResult
            {
                ErrorCode = "MISSING_ACTION_ID",
                ErrorMessage = "actionId is required.",
            });
        }

        if (_host.ActionPrograms is not IQuickerRpcActionProgramSourceHost sourceHost
            || sourceHost is IQuickerRpcActionProgramSourceAvailability { IsProgramSourceAvailable: false })
        {
            return Task.FromResult(new QuickerRpcGetActionProgramSourceResult
            {
                ActionId = actionId.Trim(),
                ErrorCode = "UNSUPPORTED_HOST",
                ErrorMessage = "The current host does not provide native action source editing. Use its supported editing interface.",
            });
        }

        return InvokeOnDispatcherAsync(
            () => sourceHost.GetProgramSourceAsync(actionId.Trim(), cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(
        string actionId,
        string bodyJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        ApplyActionProgramSourceCoreAsync(actionId, bodyJson, expectedEditVersion, force, null, false, cancellationToken);

    public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceWithStorageAsync(
        string actionId,
        string bodyJson,
        QuickerRpcActionStorageIdentity storageIdentity,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        ApplyActionProgramSourceCoreAsync(actionId, bodyJson, expectedEditVersion, force, storageIdentity, true, cancellationToken);

    private Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceCoreAsync(
        string actionId, string bodyJson, long? expectedEditVersion, bool force,
        QuickerRpcActionStorageIdentity? storageIdentity, bool requireStorage, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return SourceWriteFailure(actionId, "MISSING_ACTION_ID", "actionId is required.");
        }

        if (_host.ActionPrograms is not IQuickerRpcActionProgramSourceHost sourceHost
            || sourceHost is IQuickerRpcActionProgramSourceAvailability { IsProgramSourceAvailable: false })
        {
            return SourceWriteFailure(actionId, "UNSUPPORTED_HOST",
                "The current host does not provide native action source editing. Use its supported editing interface.");
        }

        if (requireStorage && storageIdentity is null)
            return SourceWriteFailure(actionId, "STORAGE_IDENTITY_REQUIRED", "Reopen the source to obtain its native storage identity.");
        if (requireStorage && sourceHost is not IQuickerRpcActionProgramSourceStorageHost)
            return SourceWriteFailure(actionId, "UNSUPPORTED_HOST", "The current host does not support identity-bound source writes. Reopen the action on its original host.");

        if (!force && !expectedEditVersion.HasValue)
        {
            return SourceWriteFailure(actionId, "MISSING_EDIT_VERSION", "Read the action source first and provide expectedEditVersion.");
        }

        try
        {
            using var reader = new JsonTextReader(new StringReader(bodyJson)) { DateParseHandling = DateParseHandling.None, MaxDepth = 256 };
            var body = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
            if ((body["steps"] ?? body["Steps"]) is not JArray
                || (body["variables"] ?? body["Variables"]) is not JArray
                || ((body["subPrograms"] ?? body["SubPrograms"]) is JToken subPrograms && subPrograms is not JArray))
            {
                return SourceWriteFailure(actionId, "INVALID_PROGRAM",
                    "Native program JSON requires steps and variables arrays; subPrograms, when supplied, must be an array.");
            }
        }
        catch (System.Exception ex)
        {
            return SourceWriteFailure(actionId, "INVALID_PROGRAM", "Invalid native program JSON: " + ex.Message);
        }

        return InvokeOnDispatcherAsync(
            () => requireStorage
                ? ((IQuickerRpcActionProgramSourceStorageHost)sourceHost).ApplyProgramSourceWithStorageAsync(actionId.Trim(), bodyJson, storageIdentity!, expectedEditVersion, force, cancellationToken)
                : sourceHost.ApplyProgramSourceAsync(actionId.Trim(), bodyJson, expectedEditVersion, force, cancellationToken),
            cancellationToken);
    }

    private static Task<QuickerRpcApplyXActionResult> SourceWriteFailure(string? id, string code, string message) =>
        Task.FromResult(new QuickerRpcApplyXActionResult
        {
            ActionId = id?.Trim(),
            ErrorCode = code,
            ErrorMessage = message,
        });
}
