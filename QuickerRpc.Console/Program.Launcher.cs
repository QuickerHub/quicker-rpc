using System.Linq;
using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunLauncherAsync(LauncherOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "resolve" => await RunLauncherResolveAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownLauncherVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownLauncherVerbAsync(LauncherOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_LAUNCHER_VERB",
            "Use: launcher resolve (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunLauncherResolveAsync(LauncherOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();
        if (query.Length == 0)
        {
            await EmitErrorAsync(
                options.Json,
                "LAUNCHER_RESOLVE_ARGS",
                "Provide --query for launcher resolve.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .ResolveLauncherIntentAsync(query, options.Limit, options.Scopes, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "launcher-resolve",
                        query = result.Query,
                        normalizedQuery = result.NormalizedQuery,
                        message = result.Message,
                        candidates = result.Candidates.Select(c => new
                        {
                            kind = c.Kind,
                            score = c.Score,
                            title = c.Title,
                            subtitle = c.Subtitle,
                            intent = c.Intent,
                            pageId = c.PageId,
                            presetId = c.PresetId,
                            settingKey = c.SettingKey,
                            actionId = c.ActionId,
                            subProgramId = c.SubProgramId,
                            target = c.Target,
                            suggestedTool = c.SuggestedTool,
                            suggestedInput = c.SuggestedInputJson is null
                                ? null
                                : JsonSerializer.Deserialize<object>(c.SuggestedInputJson),
                            reason = c.Reason,
                        }),
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                foreach (var c in result.Candidates)
                {
                    global::System.Console.WriteLine(
                        $"{c.Score}\t{c.Kind}\t{c.Title}\t{c.SuggestedTool}");
                }

                if (result.Candidates.Count == 0)
                {
                    global::System.Console.WriteLine(result.Message);
                }
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "LAUNCHER_RESOLVE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }
}

[Verb("launcher", HelpText = "Launcher agent helpers (unified intent resolve).")]
public sealed class LauncherOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "resolve")]
    public string? Command { get; set; }

    [Option('q', "query", HelpText = "User phrase to resolve.")]
    public string? Query { get; set; }

    [Option("scopes", HelpText = "Optional filter: settings,actions,subprograms (comma-separated).")]
    public string? Scopes { get; set; }

    [Option("limit", Default = 12, HelpText = "Max ranked candidates (1-30).")]
    public int Limit { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}
