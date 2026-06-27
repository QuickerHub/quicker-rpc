using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Runtime;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class SubProgramDesignerBridge : ISubProgramDesignerBridge
{
    public bool TryGetCompressedSubProgram(
        string idOrName,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedSubProgramResult result) =>
        ActionDesignerProgramBridge.TryGetCompressedSubProgram(idOrName, mode, out result);
}
