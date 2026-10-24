using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal static class ResourceCatalogServeOps
{
    internal static async Task<ServeInvokeResponse> PageAsync(QkrpcRpcSessionPool pool, JsonElement args, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (!TryPrepare(args, out var kind, out var request, out var failure)) return failure!;
        var rpc = await pool.GetRpcAsync(token, new[] { Program.ResourceCatalogCapability(kind) }).ConfigureAwait(false);
        var page = await Program.ReadResourceCatalogAsync(rpc, kind, request, token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        return new() { Ok = page.Success, Error = page.Success ? null : page.ErrorCode ?? "RESOURCE_CATALOG_FAILED",
            Message = page.ErrorMessage,
            Data = new { ok = page.Success, action = "resource-catalog-page", payload = Program.SerializeResourceCatalogPayload(page) } };
    }

    // This pure preparation also runs before the dispatcher's host-session discovery/handshake.
    internal static bool TryPrepare(JsonElement args, out string kind, out QuickerRpcResourceCatalogPageRequest request,
        out ServeInvokeResponse? failure)
    {
        kind = string.Empty; request = new(); failure = null;
        if (args.ValueKind != JsonValueKind.Object)
        { failure = Invalid("Resource page arguments must be an object."); return false; }
        foreach (var field in new[] { "kind", "scope", "query", "expectedSnapshotId" })
            if (args.TryGetProperty(field, out var value) && value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
            { failure = Invalid($"{field} must be a string or null."); return false; }
        foreach (var field in new[] { "skip", "take" })
            if (args.TryGetProperty(field, out var value) && (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out _)))
            { failure = Invalid($"{field} must be an Int32 number."); return false; }
        kind = ServeJsonArgs.GetString(args, "kind") ?? string.Empty;
        if (!Program.TryNormalizeResourceCatalogRequest(kind, new()
        {
            Scope = String(args, "scope") ?? QuickerRpcResourceCatalogKinds.RuntimeScope,
            Query = String(args, "query"), Skip = ServeJsonArgs.GetInt(args, "skip") ?? 0,
            Take = ServeJsonArgs.GetInt(args, "take") ?? 500,
            ExpectedSnapshotId = String(args, "expectedSnapshotId"),
        }, out request, out var code, out var error))
        { failure = new() { Ok = false, Error = code, Message = error }; return false; }
        return true;
    }

    private static string? String(JsonElement args, string name) => args.TryGetProperty(name, out var value) ? value.GetString() : null;
    private static ServeInvokeResponse Invalid(string error) => new() { Ok = false, Error = "INVALID_RESOURCE_CATALOG_REQUEST", Message = error };
}
