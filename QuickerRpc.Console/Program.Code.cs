using System.Collections.Generic;
using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static Task<int> RunExprCommandAsync(ExprOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "check" => RunExprAsync(options),
            _ => EmitErrorAndFailAsync(
                options.Json,
                "UNKNOWN_EXPR_VERB",
                "Use: expr check --code <text> | --file <path> [--variables '{\"k\":\"string\"}'] [--json]"),
        };
    }

    private static Task<int> RunScriptCommandAsync(ScriptOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "check" => RunScriptAsync(options),
            _ => EmitErrorAndFailAsync(
                options.Json,
                "UNKNOWN_SCRIPT_VERB",
                "Use: script check --code <text> | --file <path> [--references <paths>] [--json]"),
        };
    }

    private static async Task<int> RunExprAsync(ExprOptions options) =>
        await RunCodeCheckAsync(
            options,
            kind: "expression",
            checkAsync: (rpc, code, token) => rpc.CheckExpressionSyntaxAsync(
                code,
                ParseVariableTypes(options.Variables),
                token))
            .ConfigureAwait(false);

    private static async Task<int> RunScriptAsync(ScriptOptions options) =>
        await RunCodeCheckAsync(
            options,
            kind: "csharp",
            checkAsync: (rpc, code, token) => rpc.CheckCSharpScriptSyntaxAsync(code, options.References, token))
            .ConfigureAwait(false);

    private static async Task<int> RunCodeCheckAsync(
        ICodeCheckCliOptions options,
        string kind,
        Func<IQuickerRpcService, string, CancellationToken, Task<QuickerRpcCodeSyntaxCheckResult>> checkAsync)
    {
        var (ok, text, errorCode, errorMessage) = QkrpcJsonPayload.Resolve(
            options.Code,
            options.File,
            "code");
        if (!ok)
        {
            return await EmitErrorAndFailAsync(options.Json, errorCode!, errorMessage!).ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await checkAsync(session.Proxy, text!, rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = kind == "expression" ? "expr-check" : "script-check",
                        success = result.Success,
                        kind = result.Kind ?? kind,
                        message = result.Message,
                        errorCode = result.ErrorCode,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Success)
            {
                global::System.Console.WriteLine("valid");
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Success ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "CODE_CHECK_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static IDictionary<string, string>? ParseVariableTypes(string? variablesJson)
    {
        if (string.IsNullOrWhiteSpace(variablesJson))
        {
            return null;
        }

        var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(variablesJson);
        return parsed;
    }
}

internal interface ICodeCheckCliOptions
{
    string? Code { get; }

    string? File { get; }

    bool Json { get; }

    int TimeoutSeconds { get; }

    bool NoBootstrap { get; }
}

[Verb("expr", HelpText = "Check Quicker expression syntax ($= / sys:evalexpression) via plugin.")]
public sealed class ExprOptions : ICodeCheckCliOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "check")]
    public string? Command { get; set; }

    [Option("code", HelpText = "Inline expression code.")]
    public string? Code { get; set; }

    [Option("file", HelpText = "Expression file path, or - for stdin.")]
    public string? File { get; set; }

    [Option("variables", HelpText = "JSON object: variable name -> C# type name (e.g. {\"n\":\"int\"}).")]
    public string? Variables { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "RPC timeout seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Skip auto-start.")]
    public bool NoBootstrap { get; set; }
}

[Verb("script", HelpText = "Check sys:csscript C# snippet syntax via plugin (Roslyn compile).")]
public sealed class ScriptOptions : ICodeCheckCliOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "check")]
    public string? Command { get; set; }

    [Option("code", HelpText = "Inline C# script.")]
    public string? Code { get; set; }

    [Option("file", HelpText = "Script file path, or - for stdin.")]
    public string? File { get; set; }

    [Option("references", HelpText = "Extra assembly paths (one per line, same as csscript references param).")]
    public string? References { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "RPC timeout seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Skip auto-start.")]
    public bool NoBootstrap { get; set; }
}
