using System.Collections.Concurrent;
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

    private static readonly ConcurrentDictionary<string, QuickerRpcSearchStepRunnersResult> Search =
        new(StringComparer.Ordinal);

    private static readonly ConcurrentDictionary<string, QuickerRpcStepRunnerDetailResult> GetAgent =
        new(StringComparer.Ordinal);

    private static readonly ConcurrentDictionary<string, QuickerRpcStepRunnerDetailResult> GetUi =
        new(StringComparer.Ordinal);

    public static bool TryGetSearch(string query, int? limit, out QuickerRpcSearchStepRunnersResult? result)
    {
        return Search.TryGetValue(SearchKey(query, limit), out result);
    }

    public static void SetSearch(string query, int? limit, QuickerRpcSearchStepRunnersResult result)
    {
        if (!result.Success)
        {
            return;
        }

        Search[SearchKey(query, limit)] = result;
    }

    public static bool TryGetAgentDetail(
        string stepRunnerKey,
        string? controlField,
        out QuickerRpcStepRunnerDetailResult? result)
    {
        return GetAgent.TryGetValue(DetailKey("agent", stepRunnerKey, controlField), out result);
    }

    public static void SetAgentDetail(
        string stepRunnerKey,
        string? controlField,
        QuickerRpcStepRunnerDetailResult result)
    {
        if (!result.Success)
        {
            return;
        }

        GetAgent[DetailKey("agent", stepRunnerKey, controlField)] = result;
    }

    public static bool TryGetUiDetail(
        string stepRunnerKey,
        string? controlField,
        out QuickerRpcStepRunnerDetailResult? result)
    {
        return GetUi.TryGetValue(DetailKey("ui", stepRunnerKey, controlField), out result);
    }

    public static void SetUiDetail(
        string stepRunnerKey,
        string? controlField,
        QuickerRpcStepRunnerDetailResult result)
    {
        if (!result.Success)
        {
            return;
        }

        GetUi[DetailKey("ui", stepRunnerKey, controlField)] = result;
    }

    public static void Clear()
    {
        Search.Clear();
        GetAgent.Clear();
        GetUi.Clear();
    }

    private static string SearchKey(string query, int? limit) =>
        $"{SearchCacheSchemaVersion}\0{query.Trim()}\0{limit?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "*"}";

    private const int GetCacheSchemaVersion = 3;

    private static string DetailKey(string channel, string stepRunnerKey, string? controlField) =>
        $"{GetCacheSchemaVersion}\0{channel}\0{stepRunnerKey.Trim()}\0{(controlField ?? string.Empty).Trim()}";
}
