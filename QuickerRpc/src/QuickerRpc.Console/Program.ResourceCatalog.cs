using System.Text.Json;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static readonly JsonSerializerOptions ResourceCatalogJson = new(QkrpcJson.CliOutput)
    { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never };

    internal static JsonElement SerializeResourceCatalogPayload(QuickerRpcResourceCatalogPageResult page) =>
        JsonSerializer.SerializeToElement(page, ResourceCatalogJson);

    internal static string ResourceCatalogCapability(string kind) => kind == QuickerRpcResourceCatalogKinds.Action
        ? QuickerRpcHostCapabilityNames.ResourceActionPageRead : QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead;

    internal static bool TryNormalizeResourceCatalogRequest(string kind, QuickerRpcResourceCatalogPageRequest request,
        out QuickerRpcResourceCatalogPageRequest normalized, out string? code, out string? error)
    {
        var valid = ResourceCatalogPage.TryNormalizeQuery(kind,
            new ResourceCatalogPageQuery(request.Scope, request.Query, request.Skip, request.Take, request.ExpectedSnapshotId),
            out var query, out code, out error);
        normalized = new() { Scope = query.Scope, Query = query.Query, Skip = query.Skip, Take = query.Take, ExpectedSnapshotId = query.ExpectedSnapshotId };
        return valid;
    }

    internal static Task<QuickerRpcResourceCatalogPageResult> ReadResourceCatalogAsync(IQuickerRpcService rpc,
        string kind, QuickerRpcResourceCatalogPageRequest request, CancellationToken token) =>
        kind == QuickerRpcResourceCatalogKinds.Action ? rpc.GetActionResourceCatalogPageAsync(request, token)
            : rpc.GetGlobalSubProgramResourceCatalogPageAsync(request, token);

    private static async Task<int> RunResourceCatalogPageAsync(string kind, string? scope, string? query,
        int skip, int take, string? snapshotId, bool json, int timeoutSeconds, bool noBootstrap)
    {
        if (!TryNormalizeResourceCatalogRequest(kind, new() { Scope = scope ?? QuickerRpcResourceCatalogKinds.RuntimeScope,
                Query = query, Skip = skip, Take = take, ExpectedSnapshotId = snapshotId }, out var request, out var code, out var error))
            return await EmitErrorAndFailAsync(json, code!, error!).ConfigureAwait(false);
        try
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));
            await using var pool = new QkrpcRpcSessionPool(timeoutSeconds, !noBootstrap);
            var rpc = await pool.GetRpcAsync(deadline.Token, new[] { ResourceCatalogCapability(kind) }).ConfigureAwait(false);
            var response = await ReadResourceCatalogAsync(rpc, kind, request, deadline.Token).ConfigureAwait(false);
            deadline.Token.ThrowIfCancellationRequested();
            if (json)
                global::System.Console.WriteLine(JsonSerializer.Serialize(new { ok = response.Success, action = "resource-catalog-page",
                    hostBinding = pool.Binding, payload = SerializeResourceCatalogPayload(response),
                    error = response.Success ? null : response.ErrorCode ?? "RESOURCE_CATALOG_FAILED", message = response.ErrorMessage }, QkrpcJson.CliOutput));
            else if (response.Success)
            {
                foreach (var item in response.Items) global::System.Console.WriteLine($"{item.Id}\t{item.Title}");
                global::System.Console.WriteLine($"{response.Items.Count}/{response.TotalCount}; snapshotId={response.SnapshotId}; hasMore={response.HasMore}");
            }
            else global::System.Console.Error.WriteLine(response.ErrorMessage ?? response.ErrorCode);
            return response.Success ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException exception)
        { await EmitConnectErrorAsync(json, exception).ConfigureAwait(false); return ExitCodes.Error; }
        catch (OperationCanceledException)
        { await EmitRpcTimeoutAsync(json, timeoutSeconds).ConfigureAwait(false); return ExitCodes.Error; }
        catch (Exception exception)
        { return await EmitErrorAndFailAsync(json, "RESOURCE_CATALOG_FAILED", exception.Message).ConfigureAwait(false); }
    }
}
