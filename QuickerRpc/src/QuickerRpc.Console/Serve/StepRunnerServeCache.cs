using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>
/// In-memory cache for step-runner catalog RPC responses (serve process lifetime).
/// Cleared when the persistent pipe session is invalidated.
/// </summary>
internal static class StepRunnerServeCache
{
    // Bump when search match/rank behavior changes (9: controlFields for OR queries).
    private const int SearchCacheSchemaVersion = 9;

    private sealed class SessionCache
    {
        internal readonly ConcurrentDictionary<string, QuickerRpcSearchStepRunnersResult> Search = new(StringComparer.Ordinal);
        internal readonly ConcurrentDictionary<string, QuickerRpcStepRunnerDetailResult> GetAgent = new(StringComparer.Ordinal);
        internal readonly ConcurrentDictionary<string, QuickerRpcStepRunnerDetailResult> GetUi = new(StringComparer.Ordinal);
    }
    private static readonly ConditionalWeakTable<IQuickerRpcService, SessionCache> Sessions = new();
    private static SessionCache For(IQuickerRpcService rpc) => Sessions.GetValue(rpc, _ => new SessionCache());

    public static bool TryGetSearch(IQuickerRpcService rpc, string query, int? limit, out QuickerRpcSearchStepRunnersResult? result)
    {
        return For(rpc).Search.TryGetValue(SearchKey(query, limit), out result);
    }

    public static void SetSearch(IQuickerRpcService rpc, string query, int? limit, QuickerRpcSearchStepRunnersResult result)
    {
        if (!result.Success)
        {
            return;
        }

        For(rpc).Search[SearchKey(query, limit)] = result;
    }

    public static bool TryGetAgentDetail(
        IQuickerRpcService rpc,
        string stepRunnerKey,
        string? controlField,
        out QuickerRpcStepRunnerDetailResult? result)
    {
        return For(rpc).GetAgent.TryGetValue(DetailKey("agent", stepRunnerKey, controlField), out result);
    }

    public static void SetAgentDetail(
        IQuickerRpcService rpc,
        string stepRunnerKey,
        string? controlField,
        QuickerRpcStepRunnerDetailResult result)
    {
        if (!result.Success)
        {
            return;
        }

        For(rpc).GetAgent[DetailKey("agent", stepRunnerKey, controlField)] = result;
    }

    public static bool TryGetUiDetail(
        IQuickerRpcService rpc,
        string stepRunnerKey,
        string? controlField,
        out QuickerRpcStepRunnerDetailResult? result)
    {
        return For(rpc).GetUi.TryGetValue(DetailKey("ui", stepRunnerKey, controlField), out result);
    }

    public static void SetUiDetail(
        IQuickerRpcService rpc,
        string stepRunnerKey,
        string? controlField,
        QuickerRpcStepRunnerDetailResult result)
    {
        if (!result.Success)
        {
            return;
        }

        For(rpc).GetUi[DetailKey("ui", stepRunnerKey, controlField)] = result;
    }

    private static string SearchKey(string query, int? limit) =>
        $"{SearchCacheSchemaVersion}\0{query.Trim()}\0{limit?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "*"}";

    private const int GetCacheSchemaVersion = 3;

    private static string DetailKey(string channel, string stepRunnerKey, string? controlField) =>
        $"{GetCacheSchemaVersion}\0{channel}\0{stepRunnerKey.Trim()}\0{(controlField ?? string.Empty).Trim()}";
}
