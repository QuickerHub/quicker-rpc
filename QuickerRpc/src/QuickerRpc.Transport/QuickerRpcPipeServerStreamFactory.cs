using System.IO.Pipes;

namespace QuickerRpc.Transport;

internal static class QuickerRpcPipeServerStreamFactory
{
    public static NamedPipeServerStream Create(string pipeName)
    {
#if NET472
        return new NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            0,
            0,
            QuickerRpcPipeSecurity.CreateForCrossElevationPeers());
#else
        return NamedPipeServerStreamAcl.Create(
            pipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            0,
            0,
            QuickerRpcPipeSecurity.CreateForCrossElevationPeers());
#endif
    }
}
