using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1SearchHost : IQuickerRpcSearchHost
{
    private readonly ActionSearchService _actions;
    private readonly SubProgramSearchService _subPrograms;
    private readonly HeadlessActionProgramService _programs;
    private readonly HeadlessSubProgramProgramService _subProgramPrograms;
    private readonly AgentSearchIndexCoordinator _searchIndex;

    public V1SearchHost(
        ActionSearchService actions,
        SubProgramSearchService subPrograms,
        HeadlessActionProgramService programs,
        HeadlessSubProgramProgramService subProgramPrograms,
        AgentSearchIndexCoordinator searchIndex)
    {
        _actions = actions;
        _subPrograms = subPrograms;
        _programs = programs;
        _subProgramPrograms = subProgramPrograms;
        _searchIndex = searchIndex;
    }

    public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.SearchActionSummaries(query, maxResults, scope, sort));
    }

    public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_actions.SearchActions(query, maxCount, scope));
    }

    public Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_subPrograms.Search(query, maxCount));
    }

    public Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_subProgramPrograms.ListSubPrograms(query, maxCount));
    }

    public Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
        CancellationToken cancellationToken = default) =>
        HeadlessActionProgramService.SearchActionLibraryOnlineAsync(keyword, page, days, maxResults, cancellationToken);

    public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var diagnostics = _searchIndex.GetDiagnostics();
        var regions = new List<QuickerRpcSearchIndexRegionStatus>(diagnostics.Count);
        foreach (var item in diagnostics)
        {
            regions.Add(new QuickerRpcSearchIndexRegionStatus
            {
                Region = SearchIndexMapping.ToRegionName(item.Region),
                Status = SearchIndexMapping.ToStatusName(item.Status),
                Generation = item.Generation,
                BuildStartedUtcMs = item.BuildStartedUtcMs,
                BuildCompletedUtcMs = item.BuildCompletedUtcMs,
                LastBuildDurationMs = item.LastBuildDurationMs,
                DocumentCount = item.DocumentCount,
            });
        }

        return Task.FromResult(new QuickerRpcSearchIndexStatusResult { Ok = true, Regions = regions });
    }

    public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var normalized = (region ?? "all").Trim().ToLowerInvariant();
        switch (normalized)
        {
            case "all":
                _searchIndex.RebuildAll();
                break;
            case "action":
                _searchIndex.InvalidateAction();
                break;
            case "subprogram":
                _searchIndex.InvalidateSubProgram();
                break;
            default:
                return Task.FromResult(new QuickerRpcSearchIndexRebuildResult
                {
                    Ok = false,
                    Message = $"Unknown region: {region}. Use action, subprogram, or all.",
                });
        }

        return Task.FromResult(new QuickerRpcSearchIndexRebuildResult
        {
            Ok = true,
            Message = $"Rebuild scheduled for {normalized}.",
        });
    }
}

internal static class SearchIndexMapping
{
    internal static string ToRegionName(SearchRegion region) =>
        region switch
        {
            SearchRegion.Action => "action",
            SearchRegion.SubProgram => "subprogram",
            _ => region.ToString().ToLowerInvariant(),
        };

    internal static string ToStatusName(AgentSearchIndexStatus status) =>
        status switch
        {
            AgentSearchIndexStatus.Ready => "ready",
            AgentSearchIndexStatus.Building => "building",
            _ => "missing",
        };
}
