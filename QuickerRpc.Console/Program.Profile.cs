using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunProfileAsync(ProfileOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "create" => await RunProfileCreateAsync(options).ConfigureAwait(false),
            "reorder" => await RunProfileReorderAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownProfileVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> RunProfileReorderAsync(ProfileOptions options)
    {
        var scope = (options.Scope ?? string.Empty).Trim();
        if (!string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(scope, "全局", StringComparison.OrdinalIgnoreCase))
        {
            await EmitErrorAsync(options.Json, "UNSUPPORTED_SCOPE", "Only --scope global is supported.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (!options.AfterFirst)
        {
            await EmitErrorAsync(options.Json, "MISSING_AFTER_FIRST", "Provide --after-first for profile reorder.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var ids = (options.Ids ?? Array.Empty<string>())
            .Select(id => (id ?? string.Empty).Trim())
            .Where(id => id.Length > 0)
            .ToList();
        if (ids.Count == 0 && !string.IsNullOrWhiteSpace(options.Id))
        {
            ids.Add(options.Id.Trim());
        }

        if (ids.Count == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_PROFILE_IDS", "Provide one or more --id <profileGuid>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .ReorderGlobalProfilesAfterFirstAsync(ids, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "profile-reorder",
                        scope = "global",
                        afterFirst = true,
                        profileIds = ids,
                        insertAfterProfileId = result.InsertAfterProfileId,
                        insertAfterProfileName = result.InsertAfterProfileName,
                        items = result.Items,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(result.Message);
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
            await EmitErrorAsync(options.Json, "PROFILE_REORDER_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> ReportUnknownProfileVerbAsync(ProfileOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_PROFILE_VERB",
            "Use: profile create|reorder (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunProfileCreateAsync(ProfileOptions options)
    {
        var scope = (options.Scope ?? string.Empty).Trim();
        if (!string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(scope, "全局", StringComparison.OrdinalIgnoreCase))
        {
            await EmitErrorAsync(options.Json, "UNSUPPORTED_SCOPE", "Only --scope global is supported.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var count = options.Count <= 0 ? 1 : options.Count;
        if (count > 20)
        {
            await EmitErrorAsync(options.Json, "INVALID_COUNT", "count must be between 1 and 20.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .CreateGlobalProfilesAsync(count, options.AfterFirst, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "profile-create",
                        scope = "global",
                        count,
                        afterFirst = options.AfterFirst,
                        insertAfterProfileId = result.InsertAfterProfileId,
                        insertAfterProfileName = result.InsertAfterProfileName,
                        items = result.Items,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(result.Message);
                foreach (var item in result.Items)
                {
                    global::System.Console.WriteLine($"  {item.ProfileName} ({item.ProfileId}) order={item.ListOrder}");
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
            await EmitErrorAsync(options.Json, "PROFILE_CREATE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }
}

[Verb("profile", HelpText = "Quicker action profile (page) operations via RPC.")]
public sealed class ProfileOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "create | reorder")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Profile id (reorder) or single profile id.")]
    public string? Id { get; set; }

    [Option("ids", Separator = ',', HelpText = "Comma-separated profile ids for reorder.")]
    public IEnumerable<string>? Ids { get; set; }

    [Option("scope", HelpText = "Profile scope to create (global).")]
    public string? Scope { get; set; }

    [Option("count", Default = 1, HelpText = "Number of blank pages to create (1-20).")]
    public int Count { get; set; }

    [Option("after-first", HelpText = "Insert after the first global page (_global).")]
    public bool AfterFirst { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 10, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}
