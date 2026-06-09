using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Searches global (public) Quicker subprograms via DataService.GlobalSubPrograms.
/// </summary>
public sealed class SubProgramSearchService
{
    private readonly AgentSearchHub _searchHub;
    private readonly AgentSearchIndexCoordinator _searchIndex;

    public SubProgramSearchService(AgentSearchHub searchHub, AgentSearchIndexCoordinator searchIndex)
    {
        _searchHub = searchHub ?? throw new ArgumentNullException(nameof(searchHub));
        _searchIndex = searchIndex ?? throw new ArgumentNullException(nameof(searchIndex));
    }

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
            var programs = EnumerateGlobalSubPrograms();
            _searchIndex.ScheduleBuild(SearchRegion.SubProgram);
            var hits = _searchIndex.IsReady(SearchRegion.SubProgram)
                ? _searchHub.Search(
                    new SearchRequest
                    {
                        Regions = new[] { SearchRegion.SubProgram },
                        Query = keyword,
                        Limit = limit,
                    })
                : SubProgramSearchLinear.Search(programs, keyword, limit);

            var items = hits.Select(SubProgramSearchLinear.MapHit).ToList();
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
