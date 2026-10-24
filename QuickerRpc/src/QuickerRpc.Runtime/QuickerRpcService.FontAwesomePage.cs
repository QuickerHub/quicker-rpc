using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    public async Task<QuickerRpcFontAwesomePageResult> SearchFontAwesomeIconsPageAsync(
        string? query, string? style, int skip = 0, int take = 96,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var port = _host.Designer as IQuickerRpcDesignerFontAwesomePageHost;
        cancellationToken.ThrowIfCancellationRequested();
        if (port is null || !port.IsFontAwesomePageAvailable)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return new() { Success = false, ErrorMessage = "UNSUPPORTED_HOST: The selected host does not provide Font Awesome catalog paging." };
        }
        cancellationToken.ThrowIfCancellationRequested();
        var result = await port.SearchFontAwesomeIconsPageAsync(query, style, skip, take, cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        return result;
    }
}
