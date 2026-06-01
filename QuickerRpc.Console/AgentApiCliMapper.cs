using Google.Protobuf.WellKnownTypes;
using QuickerRpc.AgentModel.LocalTime;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static class AgentApiCliMapper
{
    public static SearchActionSummariesResult ToProto(QuickerRpcSearchActionSummariesResult source)
    {
        var proto = new SearchActionSummariesResult
        {
            Success = source.Success,
            ErrorMessage = source.ErrorMessage ?? string.Empty,
            Query = source.Query ?? string.Empty,
            Scope = source.Scope ?? string.Empty,
            Sort = source.Sort ?? string.Empty,
            MatchCount = source.MatchCount,
        };

        foreach (var item in source.Items ?? Array.Empty<QuickerRpcActionSummaryItem>())
        {
            proto.Items.Add(ToProto(item));
        }

        return proto;
    }

    private static ActionSummaryItem ToProto(QuickerRpcActionSummaryItem item)
    {
        var proto = new ActionSummaryItem
        {
            ActionId = item.ActionId ?? string.Empty,
            Title = item.Title ?? string.Empty,
            Description = item.Description ?? string.Empty,
            Icon = item.Icon ?? string.Empty,
            ProfileId = item.ProfileId ?? string.Empty,
            ProfileName = item.ProfileName ?? string.Empty,
            ExeFile = item.ExeFile ?? string.Empty,
            LastEditTimeLocal = string.IsNullOrWhiteSpace(item.LastEditTimeLocal)
                ? LocalTimeDisplay.FormatUtcIso(item.LastEditTimeUtc)
                : item.LastEditTimeLocal,
        };

        if (LocalTimeDisplay.TryParseUtc(item.LastEditTimeUtc, out var utc))
        {
            proto.LastEditTimeUtc = Timestamp.FromDateTimeOffset(utc);
        }

        return proto;
    }
}
