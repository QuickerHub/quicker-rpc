using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Runtime;

/// <summary>Optional bridge when Action Designer has a subprogram entity open (V1 plugin).</summary>
public interface ISubProgramDesignerBridge
{
    bool TryGetCompressedSubProgram(
        string idOrName,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedSubProgramResult result);
}
