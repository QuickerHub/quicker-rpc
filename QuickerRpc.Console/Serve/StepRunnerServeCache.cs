using System.Collections.Concurrent;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>
/// In-memory cache for step-runner catalog RPC responses (serve process lifetime).
/// Cleared when the persistent pipe session is invalidated.
/// </summary>
internal static class StepRunnerServeCache
{
    private static readonly ConcurrentDictionary<string, QuickerRpcSearchStepRunnersResult> Search =
        new(StringComparer.Ordinal);

    private static readonly ConcurrentDictionary<string, QuickerRpcStepRunnerDetailResult> Get =
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

    public static bool TryGetDetail(
        string stepRunnerKey,
        string? controlField,
        out QuickerRpcStepRunnerDetailResult? result)
    {
        return Get.TryGetValue(DetailKey(stepRunnerKey, controlField), out result);
    }

    public static void SetDetail(
        string stepRunnerKey,
        string? controlField,
        QuickerRpcStepRunnerDetailResult result)
    {
        if (!result.Success)
        {
            return;
        }

        Get[DetailKey(stepRunnerKey, controlField)] = result;
    }

    public static void Clear()
    {
        Search.Clear();
        Get.Clear();
    }

    private static string SearchKey(string query, int? limit) =>
        $"{query.Trim()}\0{limit?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "*"}";

    private static string DetailKey(string stepRunnerKey, string? controlField) =>
        $"{stepRunnerKey.Trim()}\0{(controlField ?? string.Empty).Trim()}";
}
