using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Diagnostics;

namespace QuickerRpc.Console;

internal static class ActionTraceResultEnricher
{
    internal static void EnrichFailure(QuickerRpcActionTraceRunResult result, bool includeLogExcerpt = true)
    {
        if (result.Ok)
        {
            return;
        }

        result.StackTrace ??= result.FailureLocation?.StackTrace;

        if (includeLogExcerpt && string.IsNullOrWhiteSpace(result.LogExcerpt))
        {
            result.LogExcerpt = QuickerLogTailReader.TryReadActionErrorExcerpt(
                result.ActionTitle,
                result.ActionId);
        }
    }
}
