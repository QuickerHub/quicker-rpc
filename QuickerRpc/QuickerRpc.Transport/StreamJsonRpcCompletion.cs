using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

/// <summary>
/// Helpers for awaiting <see cref="JsonRpc.Completion"/> without treating peer disconnect as a host fault.
/// </summary>
public static class StreamJsonRpcCompletion
{
    public static async Task AwaitSessionAsync(JsonRpc jsonRpc, CancellationToken cancellationToken = default)
    {
        try
        {
            await jsonRpc.Completion.ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (IsBenignSessionEnd(ex))
        {
            // Expected when the peer closes the named pipe.
        }
    }

    public static bool IsBenignSessionEnd(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is IOException or ObjectDisposedException)
            {
                return true;
            }

            var fullName = current.GetType().FullName ?? string.Empty;
            if (fullName.Contains("ConnectionLost", StringComparison.Ordinal) ||
                fullName.Contains("RemoteProtocol", StringComparison.Ordinal) ||
                fullName.Contains("JsonRpc", StringComparison.Ordinal) && fullName.Contains("Disconnect", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
