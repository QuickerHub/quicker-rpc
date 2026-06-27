using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.ActionRuntime;

internal static class ActionRuntimeQuickerLoader
{
    internal static async Task<ActionRuntimePackageBuilder.BuildResult> BuildFromActionIdAsync(
        IQuickerRpcService rpc,
        string actionId,
        string? inputParam,
        CancellationToken cancellationToken)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return ActionRuntimePackageBuilder.BuildResult.Fail(
                "MISSING_ACTION_ID",
                "Provide --id <actionId>.");
        }

        var fullResponse = await rpc
            .GetCompressedActionByIdAsync(id, "runtime", cancellationToken)
            .ConfigureAwait(false);
        if (!fullResponse.Success || string.IsNullOrWhiteSpace(fullResponse.CompressedJson))
        {
            return ActionRuntimePackageBuilder.BuildResult.Fail(
                "ACTION_GET_FAILED",
                fullResponse.ErrorMessage ?? $"action get (runtime) failed for {id}.");
        }

        string? title = null;
        var metaResponse = await rpc
            .GetCompressedActionByIdAsync(id, "metadata", cancellationToken)
            .ConfigureAwait(false);
        if (metaResponse.Success && !string.IsNullOrWhiteSpace(metaResponse.CompressedJson))
        {
            try
            {
                title = JObject.Parse(metaResponse.CompressedJson).Value<string>("title");
            }
            catch
            {
                // metadata title is optional for runtime execution
            }
        }

        return ActionRuntimePackageBuilder.BuildFromQuickerCompressed(
            id,
            title,
            fullResponse.CompressedJson,
            inputParam);
    }
}
