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
            "ensure-ceacore" => await RunEnsureCeaCoreVirtualProcessAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownProcessVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownProcessVerbAsync(ProcessOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_PROCESS_VERB",
            "Use: process ensure-ceacore (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunEnsureCeaCoreVirtualProcessAsync(ProcessOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var moveActions = options.MoveActions && !options.NoMoveActions;
            var result = await session.Proxy
                .EnsureCeaCoreRunVirtualProcessAsync(moveActions, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "process-ensure-ceacore",
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
            await EmitErrorAsync(options.Json, "PROCESS_ENSURE_CEACORE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }
}

[Verb("process", HelpText = "Quicker virtual process operations via RPC.")]
public sealed class ProcessOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "ensure-ceacore")]
    public string? Command { get; set; }

    [Option("move-actions", HelpText = "Move actions dedicated to CeaCore_Run into the new virtual page.")]
    public bool MoveActions { get; set; }

    [Option("no-move-actions", HelpText = "Deprecated alias; default is already no move.")]
    public bool NoMoveActions { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}
