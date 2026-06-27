using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class VariableDefaultValueNormalizerTests
{
    [TestMethod]
    public void EnsureQuickerRuntimeDefaults_sets_empty_string_for_text_without_default()
    {
        var variable = new JObject { ["key"] = "clipText" };
        VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(variable);

        Assert.AreEqual(string.Empty, variable["defaultValue"]?.Value<string>());
    }

    [TestMethod]
    public void EnsureQuickerRuntimeDefaults_skips_file_ref()
    {
        var variable = new JObject
        {
            ["key"] = "body",
            ["defaultValue"] = new JObject { ["file"] = "files/body-default1.txt" },
        };

        VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(variable);

        Assert.AreEqual("files/body-default1.txt", variable["defaultValue"]!["file"]!.Value<string>());
    }

    [TestMethod]
    public void NormalizeVariableForSave_injects_defaultValue_for_text()
    {
        var saved = XActionCompressor.NormalizeVariableForSave(new JObject { ["key"] = "processedText" });

        Assert.AreEqual(string.Empty, saved["defaultValue"]?.Value<string>());
        Assert.AreEqual(0, saved["type"]?.Value<int>());
    }

    [TestMethod]
    public void Compress_Variables_emits_empty_defaultValue_for_text()
    {
        var variables = new JArray
        {
            new JObject { ["key"] = "title", ["type"] = 0 },
        };

        var catalog = new QuickerRpc.AgentModel.Catalog.StepRunnerCatalog
        {
            Items = new System.Collections.Generic.List<QuickerRpc.AgentModel.Catalog.StepRunnerDefinition>(),
        };
        var compressed = XActionCompressor.Compress(new JArray(), variables, catalog, omitDefaultLiteralInputs: true);
        var variable = (JObject)compressed["variables"]![0]!;

        Assert.AreEqual(string.Empty, variable["defaultValue"]?.Value<string>());
    }
}
