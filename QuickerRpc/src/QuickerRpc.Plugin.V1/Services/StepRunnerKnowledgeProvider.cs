using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>Per-read native knowledge, with bundled hints kept separate from native facts.</summary>
internal static class StepRunnerKnowledgeProvider
{
    internal sealed class ReadResult
    {
        internal StepRunnerCatalog Catalog { get; }
        private readonly HashSet<string> _nativeKeys;
        private readonly HashSet<string> _bundledKeys;

        internal ReadResult(StepRunnerCatalog catalog, HashSet<string>? nativeKeys = null, HashSet<string>? bundledKeys = null)
        {
            Catalog = catalog;
            _nativeKeys = nativeKeys ?? new HashSet<string>(StringComparer.Ordinal);
            _bundledKeys = bundledKeys ?? new HashSet<string>(StringComparer.Ordinal);
        }

        internal string SourceFor(string key) => _nativeKeys.Contains(key) ? "runtime-definition"
            : _bundledKeys.Contains(key) ? "bundled-adapter" : "unknown";
    }

    internal static ReadResult ReadCurrent(Func<IEnumerable?> readCurrent, Func<object, StepRunnerDefinition?> map,
        Func<IEnumerable<StepRunnerDefinition>>? supplemental = null)
    {
        var catalog = new StepRunnerCatalog();
        var nativeKeys = new HashSet<string>(StringComparer.Ordinal);
        var bundledKeys = new HashSet<string>(StringComparer.Ordinal);
        var runners = readCurrent();
        if (runners is not null)
        {
            foreach (var runner in runners)
            {
                if (runner is null) continue;
                try
                {
                    var definition = map(runner);
                    if (definition is null) continue;
                    catalog.Items.Add(definition);
                    nativeKeys.Add(definition.Key);
                }
                catch
                {
                    // One broken module must not turn other native rows into bundled facts.
                }
            }
        }

        if (supplemental is not null)
        {
            foreach (var definition in supplemental())
            {
                if (catalog.Items.Any(row => string.Equals(row.Key, definition.Key, StringComparison.OrdinalIgnoreCase))) continue;
                catalog.Items.Add(definition);
                bundledKeys.Add(definition.Key);
            }
        }

        return new ReadResult(catalog, nativeKeys, bundledKeys);
    }

    internal static QuickerRpcStepRunnerDetailResult GetDetail(ReadResult read, string key, string? controlFieldValue, bool forAgent)
    {
        var mapped = StepRunnerCatalogMapper.GetDetail(read.Catalog, key, controlFieldValue);
        if (mapped.Schema is null)
            return new QuickerRpcStepRunnerDetailResult { Success = mapped.Success, ErrorMessage = mapped.ErrorMessage };
        return new QuickerRpcStepRunnerDetailResult
        {
            Success = mapped.Success, ErrorMessage = mapped.ErrorMessage,
            SchemaJson = DecorateSchema(read, mapped.Schema,
                forAgent ? StepRunnerAgentSchemaJson.Serialize(mapped.Schema) : StepRunnerUiSchemaJson.Serialize(mapped.Schema),
                controlFieldValue, forAgent ? StepRunnerKnowledgeFormats.Agent : StepRunnerKnowledgeFormats.Ui),
        };
    }

    internal static string DecorateSchema(ReadResult read, StepRunnerAgentSchema mapped, string schemaJson, string? controlFieldValue,
        string schemaFormat = StepRunnerKnowledgeFormats.Agent)
    {
        var parsed = LosslessProgramJson.ParseObject(schemaJson);
        if (parsed["knowledge"] is not null || parsed["stepRunnerKey"]?.Value<string>() != mapped.StepRunnerKey)
            throw new JsonException("Native schema does not match the mapped module or already contains knowledge metadata.");
        var definition = read.Catalog.TryFind(mapped.StepRunnerKey);
        var kind = read.SourceFor(mapped.StepRunnerKey);
        // This is a fingerprint of the observed definition/projection, never input-edit authority.
        var content = new JObject
        {
            ["definition"] = definition is null ? JValue.CreateNull() : JToken.FromObject(definition, JsonSerializer.Create(new JsonSerializerSettings
            { NullValueHandling = NullValueHandling.Include, DefaultValueHandling = DefaultValueHandling.Include })),
            ["requestedControlFieldValue"] = controlFieldValue is null ? JValue.CreateNull() : new JValue(controlFieldValue),
            // Hash the native serializer's content, including numeric lexemes; never round it through Double/Decimal.
            ["schema"] = schemaJson,
        };
        var knowledge = new JObject
        {
            ["schemaVersion"] = 1,
            ["source"] = new JObject { ["provider"] = "qkrpc.step-runner", ["kind"] = kind },
            ["schema"] = new JObject { ["format"] = schemaFormat, ["revision"] = Fingerprint(content) },
            ["requestedControlFieldValue"] = controlFieldValue is null ? JValue.CreateNull() : new JValue(controlFieldValue),
            ["nativeHelpLink"] = kind == "runtime-definition" && definition?.HelpLink is string help
                ? new JValue(help) : JValue.CreateNull(),
        };
        if (mapped.DocReference is not null)
        {
            var assembly = typeof(StepRunnerModuleDocRefCatalog).Assembly;
            using var stream = assembly.GetManifestResourceStream("QuickerRpc.AgentModel.Catalog.step-module-doc-refs.json");
            knowledge["bundledReference"] = new JObject
            {
                ["source"] = "bundled-fallback",
                ["bundleVersion"] = AssemblyVersion(assembly),
                ["indexRevision"] = stream is null ? "unknown" : Hash(stream),
            };
        }
        var closing = schemaJson.LastIndexOf('}');
        return schemaJson.Substring(0, closing) + ",\"knowledge\":" + knowledge.ToString(Formatting.None) + schemaJson.Substring(closing);
    }

    private static string AssemblyVersion(Assembly assembly) =>
        assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? assembly.GetName().Version?.ToString() ?? "unknown";

    private static string Fingerprint(JToken token)
    {
        using var bytes = new System.IO.MemoryStream(Encoding.UTF8.GetBytes(Canonical(token).ToString(Formatting.None)));
        return Hash(bytes);
    }

    private static string Hash(System.IO.Stream stream)
    {
        using var hash = SHA256.Create();
        return "sha256:" + string.Concat(hash.ComputeHash(stream).Select(value => value.ToString("x2", CultureInfo.InvariantCulture)));
    }

    private static JToken Canonical(JToken token) => token is JObject obj
        ? new JObject(obj.Properties().OrderBy(property => property.Name, StringComparer.Ordinal)
            .Select(property => new JProperty(property.Name, Canonical(property.Value))))
        : token is JArray array ? new JArray(array.Select(Canonical)) : token.DeepClone();
}
