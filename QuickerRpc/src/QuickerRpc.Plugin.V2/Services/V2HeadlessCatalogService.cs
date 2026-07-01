using QuickerRpc.AgentModel.Search;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Services;

/// <summary>Action/subprogram discovery for qkrpc list/search on V2 reflection host.</summary>
public sealed class V2HeadlessCatalogService
{
    private QuickerV2ActionAccessor? Actions => QuickerV2ActionAccessor.Current;
    private QuickerV2SubProgramAccessor? SubPrograms => QuickerV2SubProgramAccessor.Current;

    public QuickerRpcSearchActionSummariesResult SearchActionSummaries(
        string? query,
        int maxResults,
        string? scope,
        string? sort = null)
    {
        if (Actions is null)
        {
            return FailActionSummaries("Quicker V2 action accessor unavailable.");
        }

        var keyword = (query ?? string.Empty).Trim();
        var limit = Clamp(maxResults, 1, 100);
        var rows = Actions.EnumerateAllWithLocation();
        if (rows.Count == 0)
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = true,
                Query = keyword,
                Scope = scope,
                MatchCount = 0,
                Items = [],
            };
        }

        var scored = new List<(int Score, QuickerRpcActionSummaryItem Item, long EditMs)>();
        foreach (var (action, _) in rows)
        {
            if (!Actions.IsXAction(action))
            {
                continue;
            }

            var actionId = Actions.GetActionId(action);
            if (actionId.Length == 0)
            {
                continue;
            }

            var (title, description, icon, _) = Actions.GetPresentation(action);
            var score = ScoreAction(keyword, actionId, title, description);
            if (keyword.Length > 0 && score <= 0)
            {
                continue;
            }

            var editMs = Actions.GetEditVersionMs(action);
            scored.Add((score, new QuickerRpcActionSummaryItem
            {
                ActionId = actionId,
                Title = title,
                Description = description,
                Icon = icon,
                LastEditTimeUtc = FormatUtc(editMs),
                LastEditTimeLocal = FormatLocal(editMs),
                TemplateId = Actions.GetTemplateId(action),
                SharedActionId = Actions.GetSharedActionId(action),
                Source = Actions.IsFromSharedAction(action) ? "library" : "local",
                Score = keyword.Length > 0 ? score : null,
            }, editMs));
        }

        var ordered = keyword.Length == 0
            ? scored
                .OrderByDescending(x => x.EditMs)
                .Take(limit)
            : scored
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.EditMs)
                .Take(limit);

        var items = ordered.Select(x => x.Item).ToList();
        return new QuickerRpcSearchActionSummariesResult
        {
            Success = true,
            Query = keyword,
            Scope = scope,
            Sort = keyword.Length == 0 ? "lastEditDesc" : "relevance",
            MatchCount = items.Count,
            Items = items,
        };
    }

    public QuickerRpcSubProgramSearchResult ListSubPrograms(string? query, int maxCount) =>
        SearchSubPrograms(query, maxCount, emptyKeywordListsAll: true);

    public QuickerRpcSubProgramSearchResult SearchSubPrograms(string? query, int maxCount) =>
        SearchSubPrograms(query, maxCount, emptyKeywordListsAll: false);

    private QuickerRpcSubProgramSearchResult SearchSubPrograms(
        string? query,
        int maxCount,
        bool emptyKeywordListsAll)
    {
        if (SubPrograms is null)
        {
            return FailSubPrograms("Quicker V2 subprogram accessor unavailable.");
        }

        var keyword = (query ?? string.Empty).Trim();
        var limit = Clamp(maxCount, 1, 100);
        var hits = new List<(int Score, QuickerRpcSubProgramSummary Item)>();

        foreach (var subProgram in SubPrograms.EnumerateAll())
        {
            var id = SubPrograms.GetId(subProgram);
            if (id.Length == 0)
            {
                continue;
            }

            var name = QuickerV2Reflection.ReadString(subProgram, "Name") ?? string.Empty;
            var description = QuickerV2Reflection.ReadString(subProgram, "Description");
            var callId = SubPrograms.GetCallIdentifier(subProgram);
            var score = keyword.Length == 0
                ? (emptyKeywordListsAll ? 1 : 0)
                : SubProgramSearchScorer.ScoreFields(keyword, id, name, callId, description);
            if (keyword.Length > 0 && score <= 0)
            {
                continue;
            }

            hits.Add((score, new QuickerRpcSubProgramSummary
            {
                Id = id,
                Name = name,
                Description = NullIfEmpty(description),
                CallIdentifier = callId,
                Icon = NullIfEmpty(QuickerV2Reflection.ReadString(subProgram, "Icon")),
                SharedId = NullIfEmpty(QuickerV2Reflection.ReadString(subProgram, "SharedId")),
                Score = keyword.Length > 0 ? score : 0,
            }));
        }

        var items = (keyword.Length == 0
                ? hits.OrderBy(x => x.Item.Name, StringComparer.OrdinalIgnoreCase)
                : hits
                    .OrderByDescending(x => x.Score)
                    .ThenBy(x => x.Item.Name, StringComparer.OrdinalIgnoreCase))
            .Take(limit)
            .Select(x => x.Item)
            .ToList();

        return new QuickerRpcSubProgramSearchResult
        {
            Ok = true,
            Message = items.Count == 0 ? "No matching global subprograms." : string.Empty,
            Items = items,
        };
    }

    private static int ScoreAction(string keyword, string actionId, string title, string? description) =>
        TextMatchScorer.Score(
            keyword,
            [
                new TextMatchScorer.FieldRule { Value = actionId, ExactScore = 200 },
                new TextMatchScorer.FieldRule { Value = title, ExactScore = 150, ContainsScore = 100 },
                new TextMatchScorer.FieldRule { Value = description, ContainsScore = 60 },
            ]);

    private static int Clamp(int value, int min, int max) => value < min ? min : value > max ? max : value;

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string FormatUtc(long editMs) =>
        editMs <= 0
            ? string.Empty
            : DateTimeOffset.FromUnixTimeMilliseconds(editMs).UtcDateTime.ToString("o");

    private static string FormatLocal(long editMs) =>
        editMs <= 0
            ? string.Empty
            : DateTimeOffset.FromUnixTimeMilliseconds(editMs).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");

    private static QuickerRpcSearchActionSummariesResult FailActionSummaries(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcSubProgramSearchResult FailSubPrograms(string message) =>
        new() { Ok = false, Message = message };
}
