using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Searches global (public) Quicker subprograms via DataService.GlobalSubPrograms.
/// </summary>
public sealed class SubProgramSearchService
{
    public QuickerRpcSubProgramSearchResult Search(string query, int maxCount)
    {
        if (!IsInQuicker())
        {
            return new QuickerRpcSubProgramSearchResult
            {
                Ok = false,
                Message = "Not running inside Quicker (global subprogram search unavailable).",
            };
        }

        var keyword = (query ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(keyword))
        {
            return new QuickerRpcSubProgramSearchResult
            {
                Ok = false,
                Message = "query is required.",
            };
        }

        try
        {
            var limit = NormalizeMaxCount(maxCount);
            var items = SearchGlobalSubPrograms(keyword, limit);
            return new QuickerRpcSubProgramSearchResult
            {
                Ok = true,
                Message = items.Count == 0 ? "No matching global subprograms." : string.Empty,
                Items = items,
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcSubProgramSearchResult
            {
                Ok = false,
                Message = ex.Message,
            };
        }
    }

    private static List<QuickerRpcSubProgramSummary> SearchGlobalSubPrograms(string keyword, int limit)
    {
        var scored = new List<(int Score, QuickerRpcSubProgramSummary Item)>();
        foreach (var subProgram in EnumerateGlobalSubPrograms())
        {
            if (subProgram is null || string.IsNullOrWhiteSpace(subProgram.Id))
            {
                continue;
            }

            var score = ComputeMatchScore(subProgram, keyword);
            if (score <= 0)
            {
                continue;
            }

            scored.Add((score, MapSubProgram(subProgram, score)));
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Item.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.Item)
            .ToList();
    }

    private static IEnumerable<SubProgram> EnumerateGlobalSubPrograms()
    {
        try
        {
            return AppState.DataService.GlobalSubPrograms;
        }
        catch
        {
            return Array.Empty<SubProgram>();
        }
    }

    private static int ComputeMatchScore(SubProgram subProgram, string keyword)
    {
        var id = subProgram.Id ?? string.Empty;
        var name = subProgram.Name ?? string.Empty;
        var description = subProgram.Description ?? string.Empty;

        if (string.Equals(id, keyword, StringComparison.OrdinalIgnoreCase))
        {
            return 200;
        }

        if (string.Equals(name, keyword, StringComparison.OrdinalIgnoreCase))
        {
            return 150;
        }

        if (name.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return 100;
        }

        if (description.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return 60;
        }

        return 0;
    }

    private static QuickerRpcSubProgramSummary MapSubProgram(SubProgram subProgram, int score) =>
        new()
        {
            Id = subProgram.Id!.Trim(),
            Name = subProgram.Name ?? string.Empty,
            Description = NullIfEmpty(subProgram.Description),
            Score = score,
            SharedId = NullIfEmpty(subProgram.SharedId),
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram),
            Icon = NullIfEmpty(subProgram.Icon),
        };

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static int NormalizeMaxCount(int maxCount)
    {
        if (maxCount < 1)
        {
            return 1;
        }

        return maxCount > 100 ? 100 : maxCount;
    }

    private static bool IsInQuicker() =>
        Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
}
