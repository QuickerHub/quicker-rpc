using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>Placeholder host ports until V2 reflection adapters are implemented.</summary>
internal static class V2StubMessage
{
    public const string NotImplemented =
        "QuickerRpc V2 reflection host does not implement this port yet.";

}

internal sealed class V2ActionSharingHost : IQuickerRpcActionSharingHost
{
    public Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionUpdateResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionPublishResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionPublishPreflightResult { Ready = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcGetCompressedSharedActionResult
        {
            Success = false,
            ErrorMessage = V2StubMessage.NotImplemented,
        });
}

internal sealed class V2ExpressionHost : IQuickerRpcExpressionHost
{
    private readonly CodeSyntaxCheckService _syntax = new();
    private readonly ExpressionExecuteService _execute = new();

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
