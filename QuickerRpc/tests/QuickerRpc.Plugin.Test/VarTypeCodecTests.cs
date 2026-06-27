using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class VarTypeCodecTests
{
    [TestMethod]
    public void TryParse_accepts_csharp_style_type_aliases()
    {
        Assert.IsTrue(VarTypeCodec.TryParse("int", out var intType));
        Assert.AreEqual(VarTypeCodec.Integer, intType);

        Assert.IsTrue(VarTypeCodec.TryParse("string", out var textType));
        Assert.AreEqual(VarTypeCodec.Text, textType);

        Assert.IsTrue(VarTypeCodec.TryParse("bool", out var boolType));
        Assert.AreEqual(VarTypeCodec.Boolean, boolType);
    }

    [TestMethod]
    public void NormalizeVariableForSave_maps_type_int_to_quicker_integer_code()
    {
        var saved = XActionCompressor.NormalizeVariableForSave(new JObject
        {
            ["key"] = "count",
            ["type"] = "int",
            ["defaultValue"] = "0",
        });

        Assert.AreEqual(12, saved["type"]?.Value<int>());
    }

    [TestMethod]
    public void CompressStructure_Variables_maps_type_int_to_varType_integer()
    {
        var variables = new JArray
        {
            new JObject { ["key"] = "count", ["type"] = "int" },
        };

        var compressed = XActionCompressor.CompressStructure(new JArray(), variables);
        var variable = (JObject)compressed["variables"]![0]!;

        Assert.AreEqual("integer", variable["varType"]?.ToString());
    }

    [TestMethod]
    public void Compress_Variables_parses_type_int()
    {
        var variables = new JArray
        {
            new JObject { ["key"] = "count", ["type"] = "int", ["defaultValue"] = "0" },
        };

        var catalog = new StepRunnerCatalog { Items = new System.Collections.Generic.List<StepRunnerDefinition>() };
        var compressed = XActionCompressor.Compress(new JArray(), variables, catalog, omitDefaultLiteralInputs: true);
        var variable = (JObject)compressed["variables"]![0]!;

        Assert.AreEqual("integer", variable["varType"]?.ToString());
    }
}
