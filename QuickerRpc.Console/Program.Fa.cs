using System.Text.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunFaAsync(FaOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => await RunFaSearchAsync(options).ConfigureAwait(false),
            "resolve" => await RunFaResolveAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownFaVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static Task<int> ReportUnknownFaVerbAsync(FaOptions options) =>
        EmitErrorAndFailAsync(options.Json, "UNKNOWN_FA_VERB",
            "Use: fa search | fa resolve (see qkrpc help --json)");

    private static async Task<int> RunFaSearchAsync(FaOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();
        var expand = options.Expand || options.AllStyles;

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .SearchFontAwesomeIconsAsync(
                    query.Length == 0 ? null : query,
                    options.Limit,
                    expand,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = response.Success,
                        action = "fa-search",
                        query = query.Length == 0 ? null : query,
                        matchCount = response.MatchCount,
                        names = response.Names,
                        defaultStyle = response.DefaultStyle,
                        expand,
                        errorMessage = string.IsNullOrWhiteSpace(response.ErrorMessage) ? null : response.ErrorMessage,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (response.Success)
            {
                foreach (var name in response.Names)
                {
                    global::System.Console.WriteLine(name);
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(response.ErrorMessage ?? "fa search failed");
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "FA_SEARCH_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunFaResolveAsync(FaOptions options)
    {
        var specs = CollectFaResolveSpecs(options);
        if (specs.Count == 0)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "MISSING_SPEC",
                "Provide --spec fa:Light_Name or --specs '[\"fa:...\"]' (JSON array).")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ResolveFontAwesomeIconsAsync(specs, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = response.Success,
                        action = "fa-resolve",
                        count = response.Items.Count,
                        items = response.Items,
                        errors = response.Errors.Count > 0 ? response.Errors : null,
                        errorMessage = string.IsNullOrWhiteSpace(response.ErrorMessage)
                            ? null
                            : response.ErrorMessage,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (response.Success)
            {
                foreach (var item in response.Items)
                {
                    global::System.Console.WriteLine($"{item.Spec}\t{item.Width}x{item.Height}\t{item.Path.Length} chars");
                }

                foreach (var err in response.Errors)
                {
                    global::System.Console.Error.WriteLine(err);
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(response.ErrorMessage ?? "fa resolve failed");
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "FA_RESOLVE_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static List<string> CollectFaResolveSpecs(FaOptions options)
    {
        var list = new List<string>();
        if (!string.IsNullOrWhiteSpace(options.Spec))
        {
            list.Add(options.Spec.Trim());
        }

        if (!string.IsNullOrWhiteSpace(options.Specs))
        {
            try
            {
                var arr = JArray.Parse(options.Specs);
                foreach (var token in arr)
                {
                    if (token.Type == JTokenType.String)
                    {
                        var s = token.Value<string>()?.Trim();
                        if (!string.IsNullOrEmpty(s))
                        {
                            list.Add(s);
                        }
                    }
                }
            }
            catch (JsonException ex)
            {
                throw new InvalidOperationException($"Invalid --specs JSON array: {ex.Message}", ex);
            }
        }

        return list;
    }
}
