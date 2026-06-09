using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Fallback subprogram search while the indexed snapshot is building.</summary>
internal static class SubProgramSearchLinear
{
    public static IReadOnlyList<SearchHit> Search(
        IEnumerable<SubProgram> subPrograms,
        string? query,
        int limit)
    {
        var keyword = (query ?? string.Empty).Trim();
        var hits = new List<SearchHit>();

        foreach (var subProgram in subPrograms)
        {
            if (subProgram is null || string.IsNullOrWhiteSpace(subProgram.Id))
            {
                continue;
            }

            var entry = MapEntry(subProgram);
            var document = entry.ToDocument();
            var score = keyword.Length == 0
                ? 0
                : SubProgramSearchScorer.ScoreDocument(document, keyword);
            if (keyword.Length > 0 && score <= 0)
            {
                continue;
            }

            hits.Add(new SearchHit
            {
                Region = SearchRegion.SubProgram,
                DocumentId = entry.Id,
                Score = score,
                SortKey = entry.Name,
                Payload = entry,
            });
        }

        IEnumerable<SearchHit> ordered = keyword.Length == 0
            ? hits.OrderBy(h => h.SortKey, StringComparer.OrdinalIgnoreCase)
            : hits
                .OrderByDescending(h => h.Score)
                .ThenBy(h => h.SortKey, StringComparer.OrdinalIgnoreCase);

        return ordered.Take(Math.Max(1, limit)).ToList();
    }

    public static QuickerRpcSubProgramSummary MapHit(SearchHit hit)
    {
        if (hit.Payload is SubProgramSearchEntry entry)
        {
            return new QuickerRpcSubProgramSummary
            {
                Id = entry.Id,
                Name = entry.Name,
                Description = entry.Description,
                Score = hit.Score,
                SharedId = entry.SharedId,
                CallIdentifier = entry.CallIdentifier,
                Icon = entry.Icon,
            };
        }

        return new QuickerRpcSubProgramSummary
        {
            Id = hit.DocumentId,
            Name = hit.SortKey,
            Score = hit.Score,
        };
    }

    private static SubProgramSearchEntry MapEntry(SubProgram subProgram) =>
        new()
        {
            Id = subProgram.Id!.Trim(),
            Name = subProgram.Name ?? string.Empty,
            Description = NullIfEmpty(subProgram.Description),
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram),
            SharedId = NullIfEmpty(subProgram.SharedId),
            Icon = NullIfEmpty(subProgram.Icon),
        };

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
