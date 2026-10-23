using System.Text.Json;
using QuickerRpc.Console.Serve;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunActionSourceAsync(ActionOptions options, bool save)
    {
        var args = JsonSerializer.SerializeToElement(new
        {
            id = options.Id ?? options.Code, dir = options.Dir, dryRun = options.DryRun,
            minLines = options.MinLines, noAutoFiles = options.NoAutoFiles,
        });
        try
        {
            ServeInvokeResponse result;
            if (save && options.DryRun)
                result = await ActionSourceServeOps.SaveAsync(null, args, CancellationToken.None).ConfigureAwait(false);
            else
            {
                // Validate the local snapshot before connecting to Quicker.
                if (save) ActionSourceWorkspace.Prepare(options.Dir ?? string.Empty);
                await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
                var token = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
                result = save
                    ? await ActionSourceServeOps.SaveAsync(session.Proxy, args, token).ConfigureAwait(false)
                    : await ActionSourceServeOps.OpenAsync(session.Proxy, args, token).ConfigureAwait(false);
            }
            global::System.Console.WriteLine(JsonSerializer.Serialize(result, QkrpcJson.CliOutput));
            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "ACTION_SOURCE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }
}
