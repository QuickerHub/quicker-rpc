using System.Threading.Tasks;
using StreamJsonRpc;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Server → client notifications during long-running RPC (e.g. action trace streaming).</summary>
public interface IQuickerRpcClientCallbacks
{
    [JsonRpcMethod("actionTraceEvent", UseSingleObjectParameterDeserialization = true)]
    Task ActionTraceEventAsync(QuickerRpcActionTraceEvent traceEvent);
}
