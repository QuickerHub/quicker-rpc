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
        // Cross-elevation DACL is net472-only today; net10 uses default pipe ACL (Quicker V2 follow-up if needed).
        return new NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous);
#endif
    }
}
