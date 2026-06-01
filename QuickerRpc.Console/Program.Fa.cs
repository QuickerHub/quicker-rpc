using System.Text.Json;
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
            _ => await ReportUnknownFaVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static Task<int> ReportUnknownFaVerbAsync(FaOptions options) =>
        EmitErrorAndFailAsync(options.Json, "UNKNOWN_FA_VERB",
            "Use: fa search [--query <keyword>] [--limit 40] [--all-styles] [--json] (see qkrpc help --json)");

    private static async Task<int> RunFaSearchAsync(FaOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .SearchFontAwesomeIconsAsync(
                    query.Length == 0 ? null : query,
                    options.Limit,
                    options.AllStyles,
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
                        allStyles = options.AllStyles,
                        errorMessage = string.IsNullOrWhiteSpace(response.ErrorMessage) ? null : response.ErrorMessage,
                        pipe = QuickerRpcPipeNames.ServerPipe,
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
}
