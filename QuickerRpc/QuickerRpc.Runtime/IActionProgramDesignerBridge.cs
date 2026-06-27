using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Runtime;

/// <summary>Optional bridge when Action Designer has an entity open (V1 plugin).</summary>
public interface IActionProgramDesignerBridge
{
    bool TryGetCompressedAction(
        string actionId,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedActionResult result);
}
