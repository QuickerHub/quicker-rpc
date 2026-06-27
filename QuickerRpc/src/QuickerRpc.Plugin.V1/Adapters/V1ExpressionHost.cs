using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ExpressionHost : IQuickerRpcExpressionHost
{
    private readonly CodeSyntaxCheckService _syntax;
    private readonly ExpressionExecuteService _execute;

    public V1ExpressionHost(CodeSyntaxCheckService syntax, ExpressionExecuteService execute)
    {
        _syntax = syntax;
        _execute = execute;
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_syntax.CheckExpression(code, variableTypes));
    }

    public Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_execute.Execute(code, variablesJson, onUiThread));
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_syntax.CheckCSharpScript(code, references));
    }
}
