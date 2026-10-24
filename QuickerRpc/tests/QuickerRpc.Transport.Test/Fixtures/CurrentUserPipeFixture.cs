using System;
using System.IO.Pipes;
using QuickerRpc.Transport;

namespace QuickerRpc.Testing;

/// <summary>Same-user test peers use the production Windows owner/DACL, including under elevation.</summary>
public static class CurrentUserPipeFixture
{
    public static NamedPipeServerStream Create(string endpoint,
        int maxInstances = NamedPipeServerStream.MaxAllowedServerInstances,
        PipeOptions options = PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly)
    {
        if (OperatingSystem.IsWindows())
            return NamedPipeServerStreamAcl.Create(endpoint, PipeDirection.InOut, maxInstances,
                PipeTransmissionMode.Byte, options & ~PipeOptions.CurrentUserOnly, 0, 0,
                QuickerRpcPipeSecurity.CreateForCrossElevationPeers());
        return new NamedPipeServerStream(endpoint, PipeDirection.InOut, maxInstances,
            PipeTransmissionMode.Byte, options);
    }
}
