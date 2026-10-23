using System.Threading;
using System.Threading.Tasks;
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

        if (_host.ActionPrograms is not IQuickerRpcActionProgramSourceHost sourceHost)
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
        QuickerRpcActionStorageIdentity? storageIdentity = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return SourceWriteFailure(actionId, "MISSING_ACTION_ID", "actionId is required.");
        }

        if (_host.ActionPrograms is not IQuickerRpcActionProgramSourceHost sourceHost)
        {
            return SourceWriteFailure(actionId, "UNSUPPORTED_HOST",
                "The current host does not provide native action source editing. Use its supported editing interface.");
        }

        if (!force && !expectedEditVersion.HasValue)
        {
            return SourceWriteFailure(actionId, "MISSING_EDIT_VERSION", "Read the action source first and provide expectedEditVersion.");
        }

        try
        {
            var body = JObject.Parse(bodyJson);
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
            () => sourceHost.ApplyProgramSourceAsync(actionId.Trim(), bodyJson, expectedEditVersion, force, storageIdentity, cancellationToken),
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
