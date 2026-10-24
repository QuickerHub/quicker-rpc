using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Optional windowed icon catalog; independent of legacy compressed search and editor access.</summary>
public interface IQuickerRpcDesignerFontAwesomePageHost
{
    bool IsFontAwesomePageAvailable { get; }

    Task<QuickerRpcFontAwesomePageResult> SearchFontAwesomeIconsPageAsync(
        string? query, string? style, int skip = 0, int take = 96,
        CancellationToken cancellationToken = default);
}
