using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>Optional page selector on the existing Agent get tool.</summary>
public sealed class StepRunnerSchemaReadOptions
{
    [System.ComponentModel.Description("JSON Pointer into the Agent schema body; empty selects its root, excluding attached knowledge.")]
    public string? Pointer { get; set; }
    [System.ComponentModel.Description("children lists direct child paths; value returns raw JSON text fragments. Default: children.")]
    public string? Mode { get; set; }
    [System.ComponentModel.Description("Nonnegative offset: child index or UTF-16 JSON-text units. Copy nextRead for continuation.")]
    public int? Offset { get; set; }
    [System.ComponentModel.Description("Copy the current observation; required for offset greater than zero. Not editing authority.")]
    public string? ExpectedObservation { get; set; }
}

/// <summary>Stateless, bounded pages from one current Agent schema read, before any JS number conversion.</summary>
internal static class StepRunnerSchemaReader
{
    internal const string Format = "qkrpc.agent-schema-read.v1";
    internal const int PayloadLimit = 6144;
    internal const int DescriptorLimit = 2048;
    internal sealed record Request(string Key, string? Control, string Pointer, string Mode, int Offset, string? Expected);
    private sealed class ReadFailure(string code, string message) : Exception(message) { internal string Code => code; }
    private static int Size(object value) => JsonSerializer.Serialize(value, QkrpcJson.CliOutput).Length;
    private static string? Text(JsonElement value, string name) => value.ValueKind == JsonValueKind.Object
        && value.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString() : null;

    internal static bool TryPrepare(string key, string? control, JsonElement read, out Request? request, out Dictionary<string, object?>? failure)
    {
        request = null; failure = null;
        try
        {
            if (read.ValueKind != JsonValueKind.Object) throw new ReadFailure("INVALID_SCHEMA_READ", "read must be an object.");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var field in read.EnumerateObject())
                if (!seen.Add(field.Name) || field.Name is not ("pointer" or "mode" or "offset" or "expectedObservation"))
                    throw new ReadFailure("INVALID_SCHEMA_READ", "Unknown or duplicate read property.");
            string StringOption(string name, string fallback)
            {
                if (!read.TryGetProperty(name, out var value)) return fallback;
                if (value.ValueKind != JsonValueKind.String) throw new ReadFailure("INVALID_SCHEMA_READ", name + " must be a string.");
                return value.GetString()!;
            }
            var pointer = StringOption("pointer", "");
            var mode = StringOption("mode", "children");
            var expected = read.TryGetProperty("expectedObservation", out _) ? StringOption("expectedObservation", "") : null;
            var offset = 0;
            if (read.TryGetProperty("offset", out var offsetValue) && (offsetValue.ValueKind != JsonValueKind.Number || !offsetValue.TryGetInt32(out offset) || offset < 0))
                throw new ReadFailure("INVALID_SCHEMA_READ", "offset must be a nonnegative Int32.");
            if (mode is not ("children" or "value")) throw new ReadFailure("INVALID_SCHEMA_READ", "mode must be children or value.");
            if (string.IsNullOrWhiteSpace(key)) throw new ReadFailure("MISSING_KEY", "key is required.");
            request = new(key.Trim(), control, pointer, mode, offset, expected);
            if (Size(Receipt(request, "unavailable")) > DescriptorLimit)
                throw new ReadFailure("SCHEMA_READ_DESCRIPTOR_TOO_LARGE", "The exact request cannot fit the descriptor budget. Read a parent using value mode.");
            _ = Segments(pointer);
            if (expected is not null && (expected.Length != 71 || !expected.StartsWith("sha256:", StringComparison.Ordinal)
                || expected.AsSpan(7).ToArray().Any(c => c is not (>= '0' and <= '9') and not (>= 'a' and <= 'f'))))
                throw new ReadFailure("INVALID_OBSERVATION", "expectedObservation is not a schema read observation.");
            if (offset > 0 && expected is null) throw new ReadFailure("OBSERVATION_REQUIRED", "Continuation requires the previous observation.");
            return true;
        }
        catch (ReadFailure ex) { failure = Failure(request, ex.Code, ex.Message); return false; }
    }

    private static Dictionary<string, object?> Input(Request request, int offset, string? observation)
    {
        var read = new Dictionary<string, object?> { ["pointer"] = request.Pointer, ["mode"] = request.Mode, ["offset"] = offset };
        if (observation is not null) read["expectedObservation"] = observation;
        var input = new Dictionary<string, object?> { ["key"] = request.Key, ["read"] = read };
        if (request.Control is not null) input["controlField"] = request.Control;
        return input;
    }

    private static Dictionary<string, object?> Receipt(Request? request, string status)
    {
        var result = new Dictionary<string, object?>
        {
            ["format"] = Format, ["status"] = status, ["pointer"] = request?.Pointer ?? "", ["mode"] = request?.Mode ?? "children",
            ["offset"] = request?.Offset ?? 0, ["offsetUnit"] = request?.Mode == "value" ? "utf16" : "children",
            ["total"] = null, ["nextOffset"] = null, ["selectedComplete"] = false, ["agentSchemaComplete"] = false,
        };
        // A null request means no selected node, not a truncated or substituted identity.
        if (request is not null) result["input"] = Input(request, request.Offset, request.Expected);
        return result;
    }

    internal static Dictionary<string, object?> Failure(Request? request, string code, string message)
    {
        var receipt = Receipt(request, "unavailable");
        receipt["error"] = new { code, message };
        if (Size(receipt) > DescriptorLimit)
        {
            receipt = Receipt(null, "unavailable");
            receipt.Remove("input");
            receipt["error"] = new { code = "SCHEMA_READ_DESCRIPTOR_TOO_LARGE", message = "The exact request cannot fit the descriptor budget. Read a parent using value mode." };
        }
        return new() { ["success"] = false, ["schemaRead"] = receipt, ["knowledgeStatus"] = "unknown" };
    }

    internal static Dictionary<string, object?> Read(QuickerRpcStepRunnerDetailResult response, Request request,
        QuickerRpcHostBinding? owner, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        try
        {
            if (!response.Success || string.IsNullOrWhiteSpace(response.SchemaJson))
                throw new ReadFailure("SCHEMA_READ_UNAVAILABLE", "The current host did not return an Agent schema.");
            using var document = JsonDocument.Parse(response.SchemaJson, new JsonDocumentOptions { MaxDepth = 256 });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new ReadFailure("INVALID_SCHEMA", "The Agent schema must be an object.");
            CheckDuplicates(root, token);
            var actualKey = Text(root, "stepRunnerKey") ?? Text(root, "StepRunnerKey") ?? Text(root, "key") ?? Text(root, "Key");
            if (actualKey is not null && actualKey != request.Key) throw new ReadFailure("KNOWLEDGE_TARGET_MISMATCH", "The schema key differs from the request.");
            var hasKnowledge = root.TryGetProperty("knowledge", out var knowledge) && knowledge.ValueKind == JsonValueKind.Object;
            if (hasKnowledge) ValidateKnowledge(knowledge, request, owner);
            // Only the qkrpc attachment is separated. No native field table is interpreted here.
            var bodyText = ObjectWithout(root, "knowledge");
            using var body = JsonDocument.Parse(bodyText, new JsonDocumentOptions { MaxDepth = 256 });
            var stableKnowledge = hasKnowledge ? ObjectWithout(knowledge, "retrievedAt") : "null";
            var observation = owner is null ? null : Hash(JsonSerializer.Serialize(new
            {
                owner, key = request.Key, controlField = request.Control, knowledge = stableKnowledge, body = bodyText,
            }, QkrpcJson.CliOutput));
            if (request.Expected is not null && observation != request.Expected)
                throw new ReadFailure("SCHEMA_OBSERVATION_STALE", "The current owner, control, source or schema differs. Start a new read at offset 0.");
            var selected = Select(body.RootElement, request.Pointer);
            var selectedText = selected.GetRawText();
            var receipt = Receipt(request, "available");
            if (observation is not null) receipt["observation"] = observation;
            receipt["input"] = Input(request, request.Offset, observation);
            var entries = request.Mode == "children" ? Children(selected, request.Pointer) : null;
            var total = entries?.Count ?? selectedText.Length;
            if (request.Offset > total) throw new ReadFailure("SCHEMA_OFFSET_OUT_OF_RANGE", "offset exceeds the selected value or directory.");
            if (request.Mode == "value" && request.Offset > 0 && request.Offset < selectedText.Length
                && char.IsHighSurrogate(selectedText[request.Offset - 1]) && char.IsLowSurrogate(selectedText[request.Offset]))
                throw new ReadFailure("INVALID_SCHEMA_OFFSET", "offset cannot split a UTF-16 surrogate pair.");
            receipt["total"] = total;
            var known = actualKey == request.Key && hasKnowledge
                && knowledge.TryGetProperty("schemaVersion", out var metadataVersion) && metadataVersion.ValueKind == JsonValueKind.Number
                && metadataVersion.TryGetInt32(out var version) && version == 1
                && knowledge.TryGetProperty("source", out var source)
                && Text(source, "provider") == "qkrpc.step-runner" && Text(source, "kind") is "runtime-definition" or "bundled-adapter"
                && knowledge.TryGetProperty("schema", out var schemaFormat) && Text(schemaFormat, "format") == "qkrpc.agent-step-runner.v1";
            var payload = new Dictionary<string, object?> { ["success"] = true, ["schemaRead"] = receipt, ["knowledgeStatus"] = known ? "preserved" : "unknown" };
            if (hasKnowledge) payload["knowledge"] = knowledge.Clone();
            // Metadata is indivisible. Large metadata cannot consume all progress space.
            if (hasKnowledge && Size(knowledge) > 1024) { payload.Remove("knowledge"); payload["knowledgeStatus"] = "omitted"; }
            void Advance(int end)
            {
                receipt["nextOffset"] = end < total ? end : null;
                receipt["selectedComplete"] = request.Offset == 0 && end == total;
                receipt["agentSchemaComplete"] = request.Mode == "value" && request.Pointer.Length == 0 && request.Offset == 0 && end == total;
                receipt.Remove("nextRead");
                if (end < total && observation is not null) receipt["nextRead"] = Input(request, end, observation);
            }
            Advance(request.Offset);
            if (Size(receipt) > DescriptorLimit) throw new ReadFailure("SCHEMA_READ_DESCRIPTOR_TOO_LARGE", "The observation and exact continuation cannot fit. Read a parent using value mode.");
            if (entries is not null)
            {
                var page = new List<object>(); receipt["children"] = page;
                var end = request.Offset;
                while (end < total && page.Count < 32)
                {
                    token.ThrowIfCancellationRequested();
                    page.Add(entries[end]); Advance(end + 1);
                    if (Size(payload) > PayloadLimit) { page.RemoveAt(page.Count - 1); Advance(end); break; }
                    end++;
                }
                if (end == request.Offset && end < total)
                    throw new ReadFailure("SCHEMA_CHILD_TOO_LARGE", "A child path cannot fit without alteration. Read this parent using value mode.");
            }
            else
            {
                var count = Math.Min(total - request.Offset, 4096);
                while (true)
                {
                    token.ThrowIfCancellationRequested();
                    var end = request.Offset + count;
                    if (end > request.Offset && end < total && char.IsHighSurrogate(selectedText[end - 1]) && char.IsLowSurrogate(selectedText[end])) end--;
                    receipt["content"] = selectedText.Substring(request.Offset, end - request.Offset); Advance(end);
                    if (Size(payload) <= PayloadLimit) break;
                    if (count == 0) throw new ReadFailure("SCHEMA_READ_DESCRIPTOR_TOO_LARGE", "The exact page cannot fit the budget.");
                    count /= 2;
                }
                if (request.Offset < total && ((string)receipt["content"]!).Length == 0)
                    throw new ReadFailure("SCHEMA_PAGE_TOO_SMALL", "The exact next text unit cannot fit the budget.");
            }
            if (receipt["nextOffset"] is not null && observation is null)
                throw new ReadFailure("SCHEMA_READ_OWNER_UNKNOWN", "No verified transport owner; a multipart read cannot be continued safely.");
            var descriptor = receipt.Where(p => p.Key is not ("content" or "children")).ToDictionary(p => p.Key, p => p.Value);
            if (Size(descriptor) > DescriptorLimit) throw new ReadFailure("SCHEMA_READ_DESCRIPTOR_TOO_LARGE", "The exact continuation cannot fit the descriptor budget.");
            token.ThrowIfCancellationRequested();
            return payload;
        }
        catch (ReadFailure ex) { return Failure(request, ex.Code, ex.Message); }
        catch (JsonException) { return Failure(request, "INVALID_SCHEMA", "The current Agent schema is not valid, unambiguous JSON."); }
    }

    private static string Hash(string value) => "sha256:" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static string ObjectWithout(JsonElement value, string excluded) => "{" + string.Join(",", value.EnumerateObject()
        .Where(p => p.Name != excluded).Select(p => JsonSerializer.Serialize(p.Name, QkrpcJson.CliOutput) + ":" + p.Value.GetRawText())) + "}";
    private static void CheckDuplicates(JsonElement value, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (value.ValueKind == JsonValueKind.Object)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                if (!seen.Add(property.Name)) throw new ReadFailure("AMBIGUOUS_SCHEMA", "Duplicate JSON properties cannot be addressed unambiguously.");
                CheckDuplicates(property.Value, token);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckDuplicates(item, token);
    }

    private static string[] Segments(string pointer)
    {
        if (pointer.Length == 0) return [];
        if (!pointer.StartsWith('/')) throw new ReadFailure("INVALID_SCHEMA_POINTER", "A JSON Pointer must be empty or start with /.");
        return pointer.Substring(1).Split('/').Select(part =>
        {
            for (var i = 0; i < part.Length; i++)
                if (part[i] == '~' && (++i == part.Length || part[i] is not ('0' or '1')))
                    throw new ReadFailure("INVALID_SCHEMA_POINTER", "Invalid JSON Pointer escape.");
            return part.Replace("~1", "/").Replace("~0", "~");
        }).ToArray();
    }

    private static JsonElement Select(JsonElement value, string pointer)
    {
        foreach (var part in Segments(pointer))
        {
            if (value.ValueKind == JsonValueKind.Object && value.TryGetProperty(part, out var child)) value = child;
            else if (value.ValueKind == JsonValueKind.Array && (part == "0" || part.Length > 0 && part[0] is >= '1' and <= '9')
                && part.All(char.IsAsciiDigit) && int.TryParse(part, out var index) && index < value.GetArrayLength()) value = value[index];
            else throw new ReadFailure("SCHEMA_POINTER_NOT_FOUND", "The exact JSON Pointer does not exist in this schema body.");
        }
        return value;
    }

    private static List<object> Children(JsonElement selected, string pointer)
    {
        object Child(string name, JsonElement value)
        {
            var child = new Dictionary<string, object?>
            {
                ["pointer"] = pointer + "/" + name.Replace("~", "~0").Replace("/", "~1"),
                ["type"] = value.ValueKind switch { JsonValueKind.True or JsonValueKind.False => "boolean", _ => value.ValueKind.ToString().ToLowerInvariant() },
                ["jsonChars"] = value.GetRawText().Length,
            };
            if (value.ValueKind == JsonValueKind.Array) child["childCount"] = value.GetArrayLength();
            else if (value.ValueKind == JsonValueKind.Object) child["childCount"] = value.EnumerateObject().Count();
            return child;
        }
        if (selected.ValueKind == JsonValueKind.Object) return selected.EnumerateObject().Select(p => Child(p.Name, p.Value)).ToList();
        if (selected.ValueKind == JsonValueKind.Array) return selected.EnumerateArray().Select((item, index) => Child(index.ToString(System.Globalization.CultureInfo.InvariantCulture), item)).ToList();
        throw new ReadFailure("SCHEMA_NOT_CONTAINER", "children requires an object or array. Use value for a scalar.");
    }

    private static void ValidateKnowledge(JsonElement knowledge, Request request, QuickerRpcHostBinding? owner)
    {
        if (knowledge.TryGetProperty("requestedControlFieldValue", out var control) && control.ValueKind is JsonValueKind.String or JsonValueKind.Null
            && (control.ValueKind == JsonValueKind.Null ? null : control.GetString()) != request.Control)
            throw new ReadFailure("KNOWLEDGE_TARGET_MISMATCH", "Metadata belongs to another control value.");
        if (owner is null || !knowledge.TryGetProperty("source", out var source)) return;
        foreach (var field in new[] { ("hostKind", owner.HostKind), ("hostInstanceId", owner.HostInstanceId), ("hostSessionId", owner.HostSessionId), ("endpoint", owner.Endpoint) })
            if (Text(source, field.Item1) is string observed && observed != field.Item2)
                throw new ReadFailure("KNOWLEDGE_TARGET_MISMATCH", "Metadata belongs to another transport owner.");
    }
}
