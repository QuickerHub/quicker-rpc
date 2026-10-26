using System.Text.Json;
using QuickerRpc.Console.Serve;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunSourceDocumentFromArgsAsync(string[] args)
    {
        // Source/editor text is accepted only over stdin, never as shell arguments.
        if (args.Length != 3 || !string.Equals(args[1], "document", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(args[2], "--json", StringComparison.OrdinalIgnoreCase))
            return await EmitErrorAndFailAsync(true, "SOURCE_DOCUMENT_PARSE_ERROR",
                "Use: source document --json; pass the source.document args JSON object on stdin.").ConfigureAwait(false);
        if (!global::System.Console.IsInputRedirected)
            return await EmitErrorAndFailAsync(true, "INVALID_ARGS", "Provide source.document args JSON on stdin.").ConfigureAwait(false);
        try
        {
            var input = await global::System.Console.In.ReadToEndAsync().ConfigureAwait(false);
            using var json = JsonDocument.Parse(input);
            var result = ActionSourceServeOps.Document(json.RootElement, CancellationToken.None);
            global::System.Console.WriteLine(JsonSerializer.Serialize(result, QkrpcJson.CliOutput));
            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (JsonException ex)
        {
            return await EmitErrorAndFailAsync(true, "INVALID_ARGS", "Invalid source.document args JSON: " + ex.Message).ConfigureAwait(false);
        }
    }
}
