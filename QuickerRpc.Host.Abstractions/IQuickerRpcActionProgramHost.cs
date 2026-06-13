using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Host;

/// <summary>
/// Headless read/write of local XAction programs.
/// Implementations must persist through the host's authoritative V1 or V2 storage path.
/// </summary>
public interface IQuickerRpcActionProgramHost
{
  Task<QuickerRpcActionProgramSnapshot?> TryGetProgramAsync(
      string actionId,
      CancellationToken cancellationToken = default);

  Task<QuickerRpcActionProgramWriteResult> TryWriteProgramBodyAsync(
      QuickerRpcActionProgramBodyWrite write,
      CancellationToken cancellationToken = default);

  Task<QuickerRpcActionProgramWriteResult> TryUpdatePresentationAsync(
      QuickerRpcActionPresentationWrite write,
      CancellationToken cancellationToken = default);
}
