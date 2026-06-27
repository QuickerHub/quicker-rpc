using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static Task<int> RunChromeFromArgsAsync(string[] args)
    {
        if (args.Length < 2)
        {
            return EmitErrorAndFailAsync(
                args.Any(a => string.Equals(a, "--json", StringComparison.OrdinalIgnoreCase)),
                "CHROME_PARSE_ERROR",
                "Use: chrome run --operation <OpenUrl|...> [--params '{...}'] | chrome tabs [--json]");
        }

        var chromeArgs = args[1..];
        return Parser.Default.ParseArguments<ChromeOptions>(chromeArgs)
            .MapResult(
                (ChromeOptions o) => RunChromeCommandAsync(o),
                _ => EmitErrorAndFailAsync(
                    chromeArgs.Any(a => string.Equals(a, "--json", StringComparison.OrdinalIgnoreCase)),
                    "CHROME_PARSE_ERROR",
                    "Use: chrome run --operation <OpenUrl|...> [--params '{...}'] | chrome tabs [--json]"));
    }

    private static Task<int> RunChromeCommandAsync(ChromeOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "run" => RunChromeExecuteAsync(options),
            "tabs" => RunChromeTabsAsync(options),
            _ => EmitErrorAndFailAsync(
                options.Json,
                "UNKNOWN_CHROME_VERB",
                "Use: chrome run --operation <OpenUrl|RunScript|...> [--params '{...}'] | chrome tabs [--json]"),
        };
    }

    private static async Task<int> RunChromeExecuteAsync(ChromeOptions options)
    {
        var operation = (options.Operation ?? string.Empty).Trim();
        if (operation.Length == 0)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "MISSING_OPERATION",
                "Provide --operation (e.g. OpenUrl, RunScript, GetTabInfo).").ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var parametersJson = ResolveChromeParametersJson(options);
            var result = await session.Proxy
                .ExecuteChromeControlAsync(operation, parametersJson, options.SessionId, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "chrome-run",
                        success = result.Success,
                        message = result.Message,
                        errorCode = result.ErrorCode,
                        operation = result.Operation,
                        sessionId = result.SessionId,
                        tabId = result.TabId,
                        windowId = result.WindowId,
                        url = result.Url,
                        title = result.Title,
                        browser = result.Browser,
                        rawResponseJson = result.RawResponseJson,
                        outputsJson = result.OutputsJson,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (!result.Ok || !result.Success)
            {
                global::System.Console.Error.WriteLine(result.Message);
            }
            else if (!string.IsNullOrWhiteSpace(result.RawResponseJson))
            {
                global::System.Console.WriteLine(result.RawResponseJson);
            }
            else if (!string.IsNullOrWhiteSpace(result.OutputsJson))
            {
                global::System.Console.WriteLine(result.OutputsJson);
            }

            return result.Ok && result.Success ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "CHROME_RUN_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunChromeTabsAsync(ChromeOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.ListBrowserTabsAsync(rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "chrome-tabs",
                        message = result.Message,
                        errorCode = result.ErrorCode,
                        items = result.Items,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                foreach (var tab in result.Items)
                {
                    global::System.Console.WriteLine(
                        $"{tab.TabId}\t{tab.WindowId}\t{tab.Browser}\t{tab.Title}\t{tab.Url}");
                }
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "CHROME_TABS_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static string? ResolveChromeParametersJson(ChromeOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.ParamsFile))
        {
            return global::System.IO.File.ReadAllText(options.ParamsFile);
        }

        return string.IsNullOrWhiteSpace(options.Params) ? null : options.Params;
    }
}

/// <summary>Parsed after stripping the top-level <c>chrome</c> argv token.</summary>
public sealed class ChromeOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "run | tabs")]
    public string? Command { get; set; }

    [Option("operation", HelpText = "ChromeControl operation (OpenUrl, RunScript, GetTabInfo, …).")]
    public string? Operation { get; set; }

    [Option("params", HelpText = "JSON object of step inputParams (excluding operation).")]
    public string? Params { get; set; }

    [Option("params-file", HelpText = "Path to JSON file for parameters.")]
    public string? ParamsFile { get; set; }

    [Option("session", HelpText = "Session id to reuse browser/tab context (default: default).")]
    public string? SessionId { get; set; }

    [Option("timeout", Default = 30, HelpText = "RPC timeout seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Skip quicker:runaction bootstrap.")]
    public bool NoBootstrap { get; set; }

    [Option("json", HelpText = "Emit JSON.")]
    public bool Json { get; set; }
}
