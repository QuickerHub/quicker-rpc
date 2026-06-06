using System.Linq;
using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunSettingsAsync(SettingsOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => await RunSettingsListAsync(options).ConfigureAwait(false),
            "list" => await RunSettingsListAsync(options).ConfigureAwait(false),
            "get" => await RunSettingsGetAsync(options).ConfigureAwait(false),
            "set" => await RunSettingsSetAsync(options).ConfigureAwait(false),
            "apply" => await RunSettingsApplyAsync(options).ConfigureAwait(false),
            "pages" => await RunSettingsPagesAsync(options).ConfigureAwait(false),
            "links" => await RunSettingsLinksAsync(options).ConfigureAwait(false),
            "open" => await RunSettingsOpenAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownSettingsVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownSettingsVerbAsync(SettingsOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_SETTINGS_VERB",
            "Use: settings search|list|get|set|apply|pages|links|open (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunSettingsListAsync(SettingsOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);

            if (query.Length > 0)
            {
                var searchResult = await session.Proxy
                    .SearchSettingsAsync(query, options.Limit, rpcToken)
                    .ConfigureAwait(false);

                if (options.Json)
                {
                    global::System.Console.WriteLine(JsonSerializer.Serialize(
                        new
                        {
                            ok = searchResult.Ok,
                            action = "settings-list",
                            query = searchResult.Query,
                            items = searchResult.Items.Select(i => new
                            {
                                i.Key,
                                i.Scope,
                                i.Path,
                                i.Type,
                                i.Writable,
                                i.Title,
                                i.Snippet,
                                i.Description,
                                i.PageId,
                                i.PageTitle,
                                i.Keywords,
                            }),
                            pages = searchResult.Pages,
                            message = searchResult.Message,
                        },
                        QkrpcJson.CliOutput));
                }
                else if (searchResult.Ok)
                {
                    global::System.Console.WriteLine($"settings list: {searchResult.Query}");
                    foreach (var page in searchResult.Pages)
                    {
                        global::System.Console.WriteLine($"[page] {page.Title} ({page.PageId})");
                    }

                    foreach (var item in searchResult.Items)
                    {
                        global::System.Console.WriteLine($"{item.Key} ({item.Type})");
                    }
                }
                else
                {
                    global::System.Console.WriteLine(searchResult.Message ?? "settings list failed.");
                }

                return searchResult.Ok ? ExitCodes.Success : ExitCodes.Error;
            }

            var result = await session.Proxy
                .ListSettingsAsync(options.Scope, options.Limit, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-list",
                        scope = result.Scope,
                        items = result.Items,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                foreach (var item in result.Items)
                {
                    global::System.Console.WriteLine($"{item.Key} ({item.Type})");
                }
            }
            else
            {
                global::System.Console.WriteLine(result.Message ?? "settings list failed.");
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
            await EmitErrorAsync(options.Json, "SETTINGS_LIST_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsGetAsync(SettingsOptions options)
    {
        var key = (options.Key ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_KEY", "Provide --key <scope:path>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.GetSettingAsync(key, rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-get",
                        key = result.Key,
                        scope = result.Scope,
                        path = result.Path,
                        exeFile = result.ExeFile,
                        type = result.Type,
                        value = result.Value,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine($"{result.Key} = {result.Value}");
            }
            else
            {
                global::System.Console.WriteLine(result.Message ?? "settings get failed.");
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
            await EmitErrorAsync(options.Json, "SETTINGS_GET_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsSetAsync(SettingsOptions options)
    {
        var key = (options.Key ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            await EmitErrorAsync(options.Json, "MISSING_KEY", "Provide --key <scope:path>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (options.Value is null)
        {
            await EmitErrorAsync(options.Json, "MISSING_VALUE", "Provide --value <text>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.SetSettingAsync(key, options.Value, rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-set",
                        key = result.Key,
                        type = result.Type,
                        value = result.Value,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
                if (result.Ok)
                {
                    global::System.Console.WriteLine($"{result.Key} = {result.Value}");
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
            await EmitErrorAsync(options.Json, "SETTINGS_SET_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsApplyAsync(SettingsOptions options)
    {
        var resolved = QkrpcJsonPayload.Resolve(options.Changes, options.ChangesFile, "changes");
        if (!resolved.Ok)
        {
            await EmitErrorAsync(options.Json, resolved.ErrorCode!, resolved.ErrorMessage!)
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var parsed = SettingsChangesParser.ParseJson(resolved.Text!);
        if (!parsed.Ok)
        {
            await EmitErrorAsync(options.Json, parsed.ErrorCode!, parsed.ErrorMessage!)
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .ApplySettingsAsync(parsed.Changes, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-apply",
                        appliedCount = result.AppliedCount,
                        failedCount = result.FailedCount,
                        results = result.Results.Select(r => new
                        {
                            r.Ok,
                            r.Key,
                            r.Type,
                            r.Value,
                            r.Message,
                        }),
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
                foreach (var item in result.Results)
                {
                    var status = item.Ok ? "ok" : "fail";
                    global::System.Console.WriteLine($"  [{status}] {item.Key} = {item.Value} — {item.Message}");
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
            await EmitErrorAsync(options.Json, "SETTINGS_APPLY_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsPagesAsync(SettingsOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.ListSettingsPagesAsync(rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-pages",
                        pages = result.Pages,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                foreach (var page in result.Pages)
                {
                    var label = string.IsNullOrWhiteSpace(page.Title) ? page.Target : $"{page.Title} ({page.Target})";
                    global::System.Console.WriteLine(label);
                }
            }
            else
            {
                global::System.Console.WriteLine(result.Message ?? "settings pages failed.");
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
            await EmitErrorAsync(options.Json, "SETTINGS_PAGES_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsLinksAsync(SettingsOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.ListSettingsDirectLinksAsync(rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-links",
                        links = result.Links.Select(link => new
                        {
                            link.Id,
                            link.Title,
                            link.Target,
                            link.Aliases,
                            link.RequiresExe,
                            link.DefaultExe,
                            open = $"qkrpc settings open --preset {link.Id}",
                        }),
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine("settings direct links (use: qkrpc settings open --preset <id>):");
                foreach (var link in result.Links)
                {
                    global::System.Console.WriteLine($"  {link.Id}\t{link.Title}\t→ {link.Target}");
                }
            }
            else
            {
                global::System.Console.WriteLine(result.Message ?? "settings links failed.");
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
            await EmitErrorAsync(options.Json, "SETTINGS_LINKS_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSettingsOpenAsync(SettingsOptions options)
    {
        var target = (options.Page ?? options.Target ?? string.Empty).Trim();
        var query = (options.Query ?? string.Empty).Trim();
        var key = (options.Key ?? string.Empty).Trim();
        var preset = (options.Preset ?? options.Link ?? string.Empty).Trim();
        if (preset.Length == 0 && target.Length == 0 && query.Length == 0 && key.Length == 0)
        {
            target = "settings";
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .OpenSettingsUiAsync(
                    target.Length > 0 ? target : null,
                    options.Exe,
                    options.SearchText,
                    query.Length > 0 ? query : null,
                    key.Length > 0 ? key : null,
                    preset.Length > 0 ? preset : null,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "settings-open",
                        preset = result.PresetId,
                        target = result.Target,
                        pageId = result.PageId,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
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
            await EmitErrorAsync(options.Json, "SETTINGS_OPEN_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }
}

[Verb("settings", HelpText = "Quicker application settings (search, read, write, open UI).")]
public sealed class SettingsOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "search | list | get | set | apply | pages | links | open")]
    public string? Command { get; set; }

    [Option("preset", HelpText = "Direct link preset for open (see settings links). Preferred one-step open.")]
    public string? Preset { get; set; }

    [Option("link", HelpText = "Alias for --preset on open.")]
    public string? Link { get; set; }

    [Option('q', "query", HelpText = "list: search keyword; open: resolve settings page by keyword when --page omitted.")]
    public string? Query { get; set; }

    [Option("search-text", HelpText = "open: prefill Quicker search window (with --page search or when query opens search).")]
    public string? SearchText { get; set; }

    [Option("scope", HelpText = "Scope filter: userSettings | userPreference | globalSettings | exeSettings.")]
    public string? Scope { get; set; }

    [Option("page", HelpText = "Settings page id or alias for 'open' (e.g. ActionRecycleBinSettingPage, recycle-bin, AppSettings).")]
    public string? Page { get; set; }

    [Option("target", HelpText = "Alias for --page on 'open' (e.g. search, settings, 动作回收站).")]
    public string? Target { get; set; }

    [Option("exe", HelpText = "With open exe-settings: virtual process key or app exe name.")]
    public string? Exe { get; set; }

    [Option("key", HelpText = "Setting key for get/set, or open (opens the page containing this setting).")]
    public string? Key { get; set; }

    [Option("value", HelpText = "New value (settings set).")]
    public string? Value { get; set; }

    [Option("changes", HelpText = "JSON array [{key,value}] or object map for settings apply.")]
    public string? Changes { get; set; }

    [Option("changes-file", HelpText = "Path to JSON changes file (or - for stdin) for settings apply.")]
    public string? ChangesFile { get; set; }

    [Option("limit", Default = 30, HelpText = "Max results (search/list).")]
    public int Limit { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}
