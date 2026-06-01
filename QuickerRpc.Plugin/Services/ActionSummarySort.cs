using System;

namespace QuickerRpc.Plugin.Services;

internal enum ActionSummarySortMode
{
    Relevance,
    LastEditDesc,
    TitleAsc,
}

internal static class ActionSummarySort
{
    public const string LastEditApiValue = "lastEdit";
    public const string RelevanceApiValue = "relevance";
    public const string TitleApiValue = "title";

    public static ActionSummarySortMode Resolve(string? sort, bool queryIsEmpty)
    {
        if (string.IsNullOrWhiteSpace(sort))
        {
            return queryIsEmpty
                ? ActionSummarySortMode.LastEditDesc
                : ActionSummarySortMode.Relevance;
        }

        var s = sort.Trim().ToLowerInvariant();
        return s switch
        {
            "lastedit" or "last-edit" or "edit" or "recent" => ActionSummarySortMode.LastEditDesc,
            "title" or "titleasc" or "name" => ActionSummarySortMode.TitleAsc,
            "relevance" or "score" => ActionSummarySortMode.Relevance,
            _ => ActionSummarySortMode.Relevance,
        };
    }

    public static string ToApiValue(ActionSummarySortMode mode) =>
        mode switch
        {
            ActionSummarySortMode.LastEditDesc => LastEditApiValue,
            ActionSummarySortMode.TitleAsc => TitleApiValue,
            _ => RelevanceApiValue,
        };

    public static int ClampLimit(int maxResults) =>
        Math.Max(1, Math.Min(maxResults <= 0 ? 30 : maxResults, 200));
}
