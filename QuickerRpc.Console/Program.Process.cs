using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunProcessAsync(ProcessOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "ensure" => await RunEnsureVirtualProcessAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownProcessVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownProcessVerbAsync(ProcessOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_PROCESS_VERB",
            "Use: process ensure --exe <key> --name <displayName> --profile-prefix <prefix> (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunEnsureVirtualProcessAsync(ProcessOptions options)
    {
        var exeFile = (options.Exe ?? string.Empty).Trim();
        if (exeFile.Length == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_EXE", "Provide --exe <virtualProcessKey> (e.g. _my_app).")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var displayName = (options.Name ?? string.Empty).Trim();
        if (displayName.Length == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_NAME", "Provide --name <displayName>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var profilePrefix = (options.ProfilePrefix ?? string.Empty).Trim();
        if (profilePrefix.Length == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_PROFILE_PREFIX", "Provide --profile-prefix <prefix> (e.g. \"@MyApp \").")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var moveActions = options.MoveActions && !options.NoMoveActions;
        string? collectSubProgram = null;
        if (moveActions)
        {
            collectSubProgram = (options.CollectSubProgram ?? string.Empty).Trim();
            if (collectSubProgram.Length == 0)
            {
                await EmitErrorAsync(
                    options.Json,
                    "MISSING_COLLECT_SUBPROGRAM",
                    "Provide --collect-subprogram <idOrName> when using --move-actions.")
                    .ConfigureAwait(false);
                return ExitCodes.Error;
            }
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .EnsureVirtualProcessAsync(
                    exeFile,
                    displayName,
                    profilePrefix,
                    collectSubProgram,
                    dedicatedSubProgramOnly: !options.MoveAny,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "process-ensure",
                        exeFile = result.ExeFile,
                        displayName = result.DisplayName,
                        scope = result.Scope,
                        profileId = result.ProfileId,
                        profileName = result.ProfileName,
                        createdProcess = result.CreatedProcess,
                        createdProfile = result.CreatedProfile,
                        inExeSettingsDict = result.InExeSettingsDict,
                        movedActions = result.MovedActions,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(result.Message);
                foreach (var item in result.MovedActions)
                {
                    global::System.Console.WriteLine(
                        $"  {item.ActionTitle} ({item.ActionId}) ← {item.SourceProfileName} → ({item.TargetRow},{item.TargetCol})");
                }
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
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
            await EmitErrorAsync(options.Json, "PROCESS_ENSURE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }
}

[Verb("process", HelpText = "Quicker virtual process operations via RPC.")]
public sealed class ProcessOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "ensure")]
    public string? Command { get; set; }

    [Option("exe", HelpText = "Virtual process key (Quicker ExeFile), e.g. _my_app.")]
    public string? Exe { get; set; }

    [Option("name", HelpText = "Display name in scene/action management.")]
    public string? Name { get; set; }

    [Option("profile-prefix", HelpText = "Prefix for auto-created action page names (e.g. \"@MyApp \").")]
    public string? ProfilePrefix { get; set; }

    [Option("collect-subprogram", HelpText = "With --move-actions: global subprogram id/name whose callers are moved.")]
    public string? CollectSubProgram { get; set; }

    [Option("move-actions", HelpText = "Move matching actions into the new virtual page (requires --collect-subprogram).")]
    public bool MoveActions { get; set; }

    [Option("move-any", HelpText = "With --move-actions: move any action with a matching call (default: dedicated wrappers only).")]
    public bool MoveAny { get; set; }

    [Option("no-move-actions", HelpText = "Deprecated alias; default is already no move.")]
    public bool NoMoveActions { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}
