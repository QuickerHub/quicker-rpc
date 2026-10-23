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
        QuickerRpc.Contracts.Rpc.QuickerRpcHostBinding? attemptedBinding = null;
        try
        {
            ServeInvokeResponse result;
            if (save && options.DryRun)
                result = await ActionSourceServeOps.SaveAsync(null, args, CancellationToken.None).ConfigureAwait(false);
            else
            {
                // Validate the local snapshot before connecting to Quicker.
                var prepared = save ? ActionSourceWorkspace.Prepare(options.Dir ?? string.Empty) : null;
                attemptedBinding = prepared?.HostBinding;
                if (save && prepared!.HostBinding is null)
                    throw new QuickerRpcClientException(QuickerRpc.Contracts.Rpc.QuickerRpcBindingErrors.Required,
                        "This bundle has no verified host binding. Reopen explicitly before saving.");
                if (save)
                {
                    var selected = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION");
                    var raw = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
                    var expected = string.IsNullOrWhiteSpace(raw) ? null
                        : JsonSerializer.Deserialize<QuickerRpc.Contracts.Rpc.QuickerRpcHostBinding>(raw, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if ((!string.IsNullOrWhiteSpace(selected) && selected != prepared!.HostBinding!.HostSessionId)
                        || (expected is not null && !expected.SameDestination(prepared!.HostBinding!)))
                        throw new QuickerRpcClientException(QuickerRpc.Contracts.Rpc.QuickerRpcBindingErrors.Mismatch,
                            "The selected host differs from the source bundle. No save was sent.");
                }
                await using var session = save
                    ? await QuickerRpcClient.ConnectBoundAsync(prepared!.HostBinding!, options.TimeoutSeconds).ConfigureAwait(false)
                    : !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING"))
                      ? await QuickerRpcClient.ConnectAsync(options.TimeoutSeconds, false).ConfigureAwait(false)
                      : await QuickerRpcClient.ConnectSelectedAsync(new QuickerRpcHostSelection
                      { HostSessionId = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION"),
                        RequiredCapabilities = new[] { QuickerRpc.Contracts.Rpc.QuickerRpcHostCapabilityNames.ActionSourceRead } },
                        options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
                var token = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
                result = save
                    ? await ActionSourceServeOps.SaveAsync(session.Rpc, args, token).ConfigureAwait(false)
                    : await ActionSourceServeOps.OpenAsync(session.Rpc, args, token).ConfigureAwait(false);
                result.HostBinding = attemptedBinding ?? QuickerRpcClient.GetBinding(session.Rpc);
            }
            global::System.Console.WriteLine(JsonSerializer.Serialize(result, QkrpcJson.CliOutput));
            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            if (attemptedBinding is not null)
                global::System.Console.WriteLine(JsonSerializer.Serialize(new ServeInvokeResponse
                { Ok = false, Error = ex.ErrorCode, Message = ex.Message, HostBinding = attemptedBinding }, QkrpcJson.CliOutput));
            else await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
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
