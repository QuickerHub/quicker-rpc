using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Expression and C# script evaluation inside Quicker.</summary>
public interface IQuickerRpcExpressionHost
{
    Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default);
}
