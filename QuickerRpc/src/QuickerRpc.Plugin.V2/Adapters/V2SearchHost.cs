using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2SearchHost : IQuickerRpcSearchHost
{
    private readonly V2HeadlessCatalogService _catalog;
    private readonly V2HeadlessActionProgramService _programs;

    public V2SearchHost(V2HeadlessCatalogService catalog, V2HeadlessActionProgramService programs)
    {
        _catalog = catalog;
        _programs = programs;
    }

    public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_catalog.SearchActionSummaries(query, maxResults, scope, sort));
    }

    public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var summaries = _catalog.SearchActionSummaries(query, maxCount, scope);
        if (!summaries.Success)
        {
            return Task.FromResult(new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = summaries.ErrorMessage ?? "Action search failed.",
            });
        }

        return Task.FromResult(new QuickerRpcActionSearchResult
        {
            Ok = true,
            Items = summaries.Items
                .Select(x => new QuickerRpcActionSummary
                {
                    Id = x.ActionId,
                    Title = x.Title,
                    Description = x.Description,
                    Score = x.Score ?? 0,
                })
                .ToList(),
        });
    }

    public Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_catalog.SearchSubPrograms(query, maxCount));
    }

    public Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_catalog.ListSubPrograms(query, maxCount));
    }

    public Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
        CancellationToken cancellationToken = default) =>
        ActionLibrarySearchService.SearchAsync(keyword, page, days, maxResults, cancellationToken);

    public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcSearchIndexStatusResult
        {
            Ok = true,
            Regions = [],
        });

    public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcSearchIndexRebuildResult
        {
            Ok = true,
            Message = "V2 reflection host uses linear scan; no search index rebuild required.",
        });
}
