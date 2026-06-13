using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunActionLibrarySearchAsync(ActionOptions options)
    {
        var keyword = (options.Keyword ?? options.Query ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(keyword))
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_KEYWORD",
                    "Provide --keyword <text> for library search.")
                .ConfigureAwait(false);
        }

        var page = options.Page < 1 ? 1 : options.Page;
        var limit = options.Limit < 1 ? 1 : Math.Min(options.Limit, 20);

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .SearchActionLibraryAsync(keyword, page, options.Days, limit, rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToLibrarySearchPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "library.search", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
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
            return await EmitErrorAndFailAsync(options.Json, "LIBRARY_SEARCH_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionSharedGetAsync(ActionOptions options)
    {
        var sharedActionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(sharedActionId))
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_SHARED_ACTION_ID",
                    "Provide --id <sharedActionId>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .GetCompressedSharedActionAsync(sharedActionId, options.ReturnMode, rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToSharedGetPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "shared.get", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
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
            return await EmitErrorAndFailAsync(options.Json, "SHARED_GET_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }
}
