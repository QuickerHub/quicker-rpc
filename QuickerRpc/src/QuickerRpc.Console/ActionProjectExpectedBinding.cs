using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.Json;

namespace QuickerRpc.Console;

/// <summary>Per-invocation local identity CAS. Never becomes a transport target or a process-wide owner.</summary>
internal sealed class ActionProjectExpectedBinding
{
    internal const string EnvironmentKey = "QKRPC_EXPECTED_PROJECT_BINDING";
    internal const string DirectoryEnvironmentKey = "QKRPC_EXPECTED_PROJECT_DIRECTORY";
    internal const string Conflict = "PROJECT_IDENTITY_CONFLICT";
    private readonly JsonElement value;
    private ActionProjectExpectedBinding(JsonElement value) { this.value = value.Clone(); }

    internal void RequireHostWrite()
    {
        if (value.ValueKind == JsonValueKind.Null) throw Failure("An unbound document cannot authorize a host metadata write.");
    }

    internal static string RequireDirectory(string? directory, string? workspaceRoot = null)
    {
        if (string.IsNullOrWhiteSpace(directory)) throw Failure("An exact project directory is required with expected project binding.");
        return Path.GetFullPath(directory, string.IsNullOrWhiteSpace(workspaceRoot) ? Directory.GetCurrentDirectory() : Path.GetFullPath(workspaceRoot));
    }

    // Persistent HTTP/serve requests deliberately do not inherit the process environment.
    internal static ActionProjectExpectedBinding? FromArgs(JsonElement args) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty("expectedProjectBinding", out var expected)
            ? Parse(expected) : null;

    internal static ActionProjectExpectedBinding? FromEnvironment()
    {
        var raw = Environment.GetEnvironmentVariable(EnvironmentKey);
        if (raw is null) return null;
        try { using var document = JsonDocument.Parse(raw); return Parse(document.RootElement); }
        catch (JsonException ex) { throw Failure("Expected project binding is invalid: " + ex.Message); }
    }

    private static ActionProjectExpectedBinding Parse(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Null)
        {
            // Validate the known contract, but retain the raw host object for full-extension CAS.
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("schemaVersion", out var schema) || schema.ValueKind != JsonValueKind.Number || !schema.TryGetInt32(out var schemaVersion) || schemaVersion != 1
                || !value.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String || kind.GetString() != "action"
                || !value.TryGetProperty("actionId", out var id) || id.ValueKind != JsonValueKind.String || !Guid.TryParse(id.GetString(), out _)
                || !value.TryGetProperty("hostBinding", out var host) || host.ValueKind != JsonValueKind.Object)
                throw Failure("Expected project binding must be null or a version-1 action binding.");
            _ = Fingerprint(value); // Reject unsupported JSON/depth before acquiring resources.
        }
        return new ActionProjectExpectedBinding(value);
    }

    /// <summary>Caller must hold the same project lease used by local writers/exporters.</summary>
    internal void AssertMatches(string directory)
    {
        var path = Path.Combine(Path.GetFullPath(directory), ActionProjectHostBinding.RelativePath.Replace('/', Path.DirectorySeparatorChar));
        ActionProjectHostBinding.RequireSafePath(path);
        if (!File.Exists(path))
        {
            if (value.ValueKind != JsonValueKind.Null) throw Failure("The project binding disappeared after this document was opened.");
            return;
        }
        if (value.ValueKind == JsonValueKind.Null) throw Failure("An unbound document acquired a host binding after it was opened.");
        // Also enforce directory/info identity and the existing safe-file contract.
        _ = ActionProjectHostBinding.Read(directory);
        using var actual = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
        if (Fingerprint(value) != Fingerprint(actual.RootElement))
            throw Failure("The complete project binding changed after this document was opened.");
    }

    private static string Fingerprint(JsonElement value)
    {
        using var bytes = new MemoryStream();
        using (var writer = new Utf8JsonWriter(bytes))
        {
            writer.WriteStartObject();
            // This is the same root projection as the client contract; host extensions remain intact.
            foreach (var name in new[] { "actionId", "hostBinding", "kind", "schemaVersion" })
            {
                writer.WritePropertyName(name);
                var property = value.GetProperty(name);
                if (name == "actionId") writer.WriteStringValue(property.GetString()!.ToLowerInvariant());
                else WriteSorted(writer, property);
            }
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(bytes.ToArray());
    }

    private static void WriteSorted(Utf8JsonWriter writer, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var properties = new SortedDictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject()) properties[property.Name] = property.Value;
            writer.WriteStartObject();
            foreach (var property in properties) { writer.WritePropertyName(property.Key); WriteSorted(writer, property.Value); }
            writer.WriteEndObject();
        }
        else if (value.ValueKind == JsonValueKind.Array)
        {
            writer.WriteStartArray(); foreach (var item in value.EnumerateArray()) WriteSorted(writer, item); writer.WriteEndArray();
        }
        else if (value.ValueKind == JsonValueKind.Number)
        {
            // Exact canonical decimal: do not round opaque extension integers through double.
            writer.WriteRawValue(CanonicalNumber(value.GetRawText()), skipInputValidation: true);
        }
        else value.WriteTo(writer);
    }

    private static string CanonicalNumber(string number)
    {
        var negative = number.StartsWith('-');
        if (negative) number = number[1..];
        var e = number.IndexOfAny(['e', 'E']);
        var exponent = e < 0 ? BigInteger.Zero : BigInteger.Parse(number[(e + 1)..], CultureInfo.InvariantCulture);
        var mantissa = e < 0 ? number : number[..e];
        var dot = mantissa.IndexOf('.');
        if (dot >= 0) exponent -= mantissa.Length - dot - 1;
        var digits = mantissa.Replace(".", string.Empty).TrimStart('0');
        if (digits.Length == 0) return "0";
        var trimmed = digits.TrimEnd('0');
        exponent += digits.Length - trimmed.Length;
        return (negative ? "-" : string.Empty) + trimmed + "e" + exponent.ToString(CultureInfo.InvariantCulture);
    }

    private static QuickerRpcClientException Failure(string message) => new(Conflict, message);
}
