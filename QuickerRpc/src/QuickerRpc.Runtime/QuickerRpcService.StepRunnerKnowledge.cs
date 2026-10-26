using System;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    private QuickerRpcStepRunnerDetailResult AddStepRunnerKnowledgeOwner(QuickerRpcStepRunnerDetailResult result, string stepRunnerKey, string? controlFieldValue, string schemaFormat)
    {
        if (!result.Success || string.IsNullOrWhiteSpace(result.SchemaJson)) return result;
        JObject schema;
        try { schema = LosslessProgramJson.ParseObject(result.SchemaJson); }
        catch (JsonException) { return result; }

        var returnedKey = KnowledgeString(schema["stepRunnerKey"]);
        if (returnedKey is not null && !string.Equals(returnedKey, stepRunnerKey?.Trim(), StringComparison.Ordinal))
            return new QuickerRpcStepRunnerDetailResult
            { Success = false, ErrorMessage = "KNOWLEDGE_TARGET_MISMATCH: The native schema does not match the requested step runner." };

        var knowledge = schema["knowledge"] as JObject;
        var source = knowledge?["source"] as JObject;
        var format = knowledge?["schema"] as JObject;
        var revision = KnowledgeString(format?["revision"]);
        var kind = KnowledgeString(source?["kind"]);
        var requested = knowledge?["requestedControlFieldValue"];
        if (requested is not null && (requested.Type == JTokenType.Null || requested.Type == JTokenType.String)
            && (requested.Type == JTokenType.Null ? controlFieldValue is not null : requested.Value<string>() != controlFieldValue))
            return new QuickerRpcStepRunnerDetailResult
            { Success = false, ErrorMessage = "KNOWLEDGE_TARGET_MISMATCH: The schema belongs to another control value." };
        var info = _host.Info;
        var hostKind = info.Kind == QuickerHostKind.V1 ? "v1" : info.Kind == QuickerHostKind.V2 ? "v2" : "unknown";
        foreach (var expected in new[] { ("hostInstanceId", _hostSessionScope.InstanceId), ("hostSessionId", _hostSessionScope.Id),
            ("endpoint", _hostSessionScope.Endpoint), ("hostKind", hostKind) })
        {
            var observed = KnowledgeString(source?[expected.Item1]);
            if (observed is not null && observed != expected.Item2)
                return new QuickerRpcStepRunnerDetailResult
                { Success = false, ErrorMessage = "KNOWLEDGE_TARGET_MISMATCH: The schema belongs to another host owner." };
        }
        var proved = returnedKey is not null
            && knowledge?["schemaVersion"]?.Type == JTokenType.Integer && knowledge["schemaVersion"]!.ToString(Formatting.None) == "1"
            && KnowledgeString(source?["provider"]) == "qkrpc.step-runner"
            && KnowledgeString(format?["format"]) == schemaFormat
            && revision is not null && revision.StartsWith("sha256:", StringComparison.Ordinal)
            && revision.Length == 71 && revision.Substring(7).All(value => value is >= '0' and <= '9' or >= 'a' and <= 'f')
            && (controlFieldValue is null ? requested?.Type == JTokenType.Null
                : requested?.Type == JTokenType.String && requested.Value<string>() == controlFieldValue)
            && (kind == "runtime-definition" || kind == "bundled-adapter" || kind == "unknown");
        if (!proved)
        {
            schema.Remove("knowledge");
            using var hash = SHA256.Create();
            var content = new JObject
            {
                ["schema"] = schema.DeepClone(),
                ["requestedControlFieldValue"] = controlFieldValue is null ? JValue.CreateNull() : new JValue(controlFieldValue),
            };
            revision = "sha256:" + string.Concat(hash.ComputeHash(Encoding.UTF8.GetBytes(CanonicalKnowledge(content).ToString(Formatting.None)))
                .Select(value => value.ToString("x2", CultureInfo.InvariantCulture)));
            kind = "unknown";
            knowledge = new JObject
            {
                ["schemaVersion"] = 1,
                ["schema"] = new JObject { ["format"] = schemaFormat, ["revision"] = revision },
                ["requestedControlFieldValue"] = controlFieldValue is null ? JValue.CreateNull() : new JValue(controlFieldValue),
            };
        }

        var adapter = _host.GetType().Assembly;
        knowledge!["source"] = new JObject
        {
            ["provider"] = "qkrpc.step-runner", ["kind"] = kind,
            ["hostKind"] = hostKind,
            ["quickerVersion"] = KnowledgeVersion(info.QuickerVersion),
            ["adapterAssembly"] = KnowledgeVersion(info.AdapterAssembly),
            ["adapterVersion"] = KnowledgeVersion(adapter.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                ?? adapter.GetName().Version?.ToString()),
            ["hostInstanceId"] = _hostSessionScope.InstanceId, ["hostSessionId"] = _hostSessionScope.Id,
            ["endpoint"] = _hostSessionScope.Endpoint,
        };
        knowledge["retrievedAt"] = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
        if (kind != "runtime-definition" || knowledge["nativeHelpLink"]?.Type != JTokenType.String)
            knowledge["nativeHelpLink"] = JValue.CreateNull();
        string json;
        try { json = ReplaceKnowledgeJson(result.SchemaJson, knowledge.ToString(Formatting.None)); }
        catch (System.Text.Json.JsonException)
        {
            return new QuickerRpcStepRunnerDetailResult { Success = false, ErrorMessage = "INVALID_STEP_RUNNER_SCHEMA: Expected one JSON schema object." };
        }
        return new QuickerRpcStepRunnerDetailResult
        { Success = result.Success, ErrorMessage = result.ErrorMessage, SchemaJson = json };
    }

    private static string KnowledgeVersion(string? value) => string.IsNullOrWhiteSpace(value) ? "unknown" : value!;
    private static string? KnowledgeString(JToken? value) => value?.Type == JTokenType.String ? value.Value<string>() : null;

    private static string ReplaceKnowledgeJson(string json, string knowledge)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        var reader = new System.Text.Json.Utf8JsonReader(bytes, new System.Text.Json.JsonReaderOptions { MaxDepth = 256 });
        if (!reader.Read() || reader.TokenType != System.Text.Json.JsonTokenType.StartObject) throw new System.Text.Json.JsonException();
        var properties = 0;
        var start = -1;
        var end = -1;
        var closing = -1;
        while (reader.Read())
        {
            if (reader.TokenType == System.Text.Json.JsonTokenType.EndObject && reader.CurrentDepth == 0)
            { closing = checked((int)reader.TokenStartIndex); break; }
            if (reader.TokenType != System.Text.Json.JsonTokenType.PropertyName || reader.CurrentDepth != 1) throw new System.Text.Json.JsonException();
            properties++;
            var replace = reader.ValueTextEquals("knowledge");
            if (!reader.Read()) throw new System.Text.Json.JsonException();
            var valueStart = checked((int)reader.TokenStartIndex);
            reader.Skip();
            if (replace)
            {
                if (start >= 0) throw new System.Text.Json.JsonException();
                start = valueStart;
                end = checked((int)reader.BytesConsumed);
            }
        }
        if (closing < 0 || reader.Read()) throw new System.Text.Json.JsonException();
        if (start >= 0)
            return Encoding.UTF8.GetString(bytes, 0, start) + knowledge + Encoding.UTF8.GetString(bytes, end, bytes.Length - end);
        return Encoding.UTF8.GetString(bytes, 0, closing) + (properties == 0 ? "" : ",") + "\"knowledge\":" + knowledge
            + Encoding.UTF8.GetString(bytes, closing, bytes.Length - closing);
    }

    private static JToken CanonicalKnowledge(JToken token) => token is JObject obj
        ? new JObject(obj.Properties().OrderBy(property => property.Name, StringComparer.Ordinal)
            .Select(property => new JProperty(property.Name, CanonicalKnowledge(property.Value))))
        : token is JArray array ? new JArray(array.Select(CanonicalKnowledge)) : token.DeepClone();
}
