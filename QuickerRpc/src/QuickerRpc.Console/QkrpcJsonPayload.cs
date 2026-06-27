using System.Text;

namespace QuickerRpc.Console;

/// <summary>Read JSON payloads from inline text, file path, or stdin (<c>-</c>).</summary>
internal static class QkrpcJsonPayload
{
    public static (bool Ok, string? Text, string? ErrorCode, string? ErrorMessage) Resolve(
        string? inline,
        string? filePath,
        string paramName)
    {
        var hasInline = !string.IsNullOrWhiteSpace(inline);
        var hasFile = !string.IsNullOrWhiteSpace(filePath);

        if (hasInline && hasFile)
        {
            return (false, null, "CONFLICTING_JSON_INPUT",
                $"Use either --{paramName} or --{paramName}-file, not both.");
        }

        if (hasFile)
        {
            return ReadFromPath(filePath!.Trim(), paramName);
        }

        if (hasInline)
        {
            return (true, inline, null, null);
        }

        return (false, null, "MISSING_JSON_INPUT",
            $"Provide --{paramName} <json> or --{paramName}-file <path|->.");
    }

    private static (bool Ok, string? Text, string? ErrorCode, string? ErrorMessage) ReadFromPath(
        string path,
        string paramName)
    {
        try
        {
            if (path == "-")
            {
                using var reader = new StreamReader(global::System.Console.OpenStandardInput(), Encoding.UTF8);
                var text = reader.ReadToEnd();
                if (string.IsNullOrWhiteSpace(text))
                {
                    return (false, null, "EMPTY_JSON_INPUT", $"Stdin JSON for --{paramName}-file is empty.");
                }

                return (true, text, null, null);
            }

            if (!File.Exists(path))
            {
                return (false, null, "JSON_FILE_NOT_FOUND", $"JSON file not found: {path}");
            }

            var fileText = File.ReadAllText(path, Encoding.UTF8);
            if (string.IsNullOrWhiteSpace(fileText))
            {
                return (false, null, "EMPTY_JSON_FILE", $"JSON file is empty: {path}");
            }

            return (true, fileText, null, null);
        }
        catch (Exception ex)
        {
            return (false, null, "JSON_FILE_READ_FAILED", ex.Message);
        }
    }
}
