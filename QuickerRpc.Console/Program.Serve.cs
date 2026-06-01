namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunServeAsync(ServeOptions options)
    {
        var host = (options.Host ?? "127.0.0.1").Trim();
        var port = options.Port > 0 ? options.Port : 9477;
        await using var http = new Serve.QkrpcHttpHost(
            host,
            port,
            options.TimeoutSeconds,
            !options.NoBootstrap);

        using var cts = new CancellationTokenSource();
        global::System.Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        try
        {
            await http.RunAsync(cts.Token).ConfigureAwait(false);
            return ExitCodes.Success;
        }
        catch (OperationCanceledException)
        {
            return ExitCodes.Success;
        }
    }
}
