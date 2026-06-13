using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Host;

/// <summary>Share / refresh shared actions on getquicker.net.</summary>
public interface IQuickerRpcActionSharingHost
{
    Task<QuickerRpcActionSharingResult> UpdateSharedActionAsync(
        string actionId,
        string changeLog,
        CancellationToken cancellationToken = default);
}
