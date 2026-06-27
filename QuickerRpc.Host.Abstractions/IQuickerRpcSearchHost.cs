using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Action/subprogram/library search and search-index maintenance.</summary>
public interface IQuickerRpcSearchHost
{
    Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default);
}
