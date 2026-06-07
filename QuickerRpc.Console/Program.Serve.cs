namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunServeAsync(ServeOptions options)
    {
        if (string.Equals(options.Command, "openapi", StringComparison.OrdinalIgnoreCase))
        {
            return RunServeOpenApiExport(options);
        }

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

    private static int RunServeOpenApiExport(ServeOptions options)
    {
        var host = (options.Host ?? "127.0.0.1").Trim();
        var port = options.Port > 0 ? options.Port : 9477;
        var baseUrl = $"http://{host}:{port}";
        var json = Serve.ServeOpenApiDocument.BuildJson(baseUrl);

        if (!string.IsNullOrWhiteSpace(options.Out))
        {
            var path = Path.GetFullPath(options.Out.Trim());
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, json + Environment.NewLine, System.Text.Encoding.UTF8);
            if (!options.Json)
            {
                global::System.Console.Error.WriteLine($"OpenAPI written: {path}");
            }
        }

        if (options.Json || string.IsNullOrWhiteSpace(options.Out))
        {
            global::System.Console.WriteLine(json);
        }

        return ExitCodes.Success;
    }
}
