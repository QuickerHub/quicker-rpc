using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Runtime;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class ActionProgramDesignerBridge : IActionProgramDesignerBridge
{
    public bool TryGetCompressedAction(
        string actionId,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedActionResult result) =>
        ActionDesignerProgramBridge.TryGetCompressedAction(actionId, mode, out result);
}
