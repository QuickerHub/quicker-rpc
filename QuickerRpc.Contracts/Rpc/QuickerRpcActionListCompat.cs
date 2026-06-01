using System;
using System.Threading;
using System.Threading.Tasks;
using StreamJsonRpc;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// Calls SearchActionSummaries on plugins before the sort parameter was added to RPC.
/// </summary>
public static class QuickerRpcActionListCompat
{
    public static Task<QuickerRpcSearchActionSummariesResult> ListAsync(
        QuickerRpcClientSession session,
        string? query,
        int maxResults,
        string? scope,
        string? sort,
        CancellationToken cancellationToken = default) =>
        ListAsync(session.Rpc, session.JsonRpc, query, maxResults, scope, sort, cancellationToken);

    public static async Task<QuickerRpcSearchActionSummariesResult> ListAsync(
        IQuickerRpcService rpc,
        JsonRpc jsonRpc,
        string? query,
        int maxResults,
        string? scope,
        string? sort,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await rpc
                .SearchActionSummariesAsync(query, maxResults, scope, sort, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (ShouldRetryWithLegacySearchActionSummaries(ex))
        {
            return await InvokeLegacySearchActionSummariesAsync(
                    jsonRpc,
                    query,
                    maxResults,
                    scope,
                    cancellationToken)
                .ConfigureAwait(false);
        }
    }

    private static async Task<QuickerRpcSearchActionSummariesResult> InvokeLegacySearchActionSummariesAsync(
        JsonRpc jsonRpc,
        string? query,
        int maxResults,
        string? scope,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await jsonRpc
            .InvokeAsync<QuickerRpcSearchActionSummariesResult>(
                nameof(IQuickerRpcService.SearchActionSummariesAsync),
                query ?? (object?)null,
                maxResults,
                scope ?? (object?)null)
            .ConfigureAwait(false);
    }

    private static bool ShouldRetryWithLegacySearchActionSummaries(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            var text = current.Message + " " + current.ToString();
            if (!text.Contains(nameof(IQuickerRpcService.SearchActionSummariesAsync), StringComparison.Ordinal))
            {
                continue;
            }

            if (text.Contains("/4", StringComparison.Ordinal)
                || text.Contains("提供 4", StringComparison.Ordinal)
                || text.Contains("provided 4", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
