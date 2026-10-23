using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Proto;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class InputParamLiteralPrefixTests
{
    [DataTestMethod]
    [DataRow("@value:Name", "@value:@value:Name")]
    [DataRow("@var:Name", "@value:@var:Name")]
    [DataRow("@file:Name", "@value:@file:Name")]
    [DataRow("@VaR: Name ", "@value:@VaR: Name ")]
    [DataRow("@FiLe: files\\name.txt ", "@value:@FiLe: files\\name.txt ")]
    [DataRow("@VaLuE:", "@value:@VaLuE:")]
    [DataRow("@value:@var:Name", "@value:@value:@var:Name")]
    [DataRow("@value: line\r\n", "@value:@value: line\r\n")]
    [DataRow("@var:", "@var:")]
    [DataRow("@var: \t", "@var: \t")]
    [DataRow("@file:", "@file:")]
    [DataRow("@file: \t", "@file: \t")]
    [DataRow(" @var:Name", " @var:Name")]
    [DataRow("@variable:Name", "@variable:Name")]
    [DataRow("@object:Name", "@object:Name")]
    [DataRow("$=Name", "$=Name")]
    [DataRow("plain", "plain")]
    public void Literal_compact_expand_preserves_text_and_stabilizes_after_each_cycle(string literal, string wire)
    {
        foreach (var valueKey in new[] { "value", "Value" })
        {
            var inputs = new JObject { ["text"] = new JObject { [valueKey] = literal } };
            for (var cycle = 0; cycle < 3; cycle++)
            {
                InputParamWireCoercer.CompactInputParamsObject(inputs);
                Assert.AreEqual(wire, inputs["text"]!.Value<string>(), $"compact cycle {cycle}");
                InputParamWireCoercer.ExpandInputParamsObject(inputs);
                Assert.AreEqual(literal, inputs["text"]!["value"]!.Value<string>(), $"expand cycle {cycle}");
                Assert.IsNull(inputs["text"]!["varKey"]);
                Assert.IsNull(inputs["text"]!["file"]);
            }
        }
    }

    [TestMethod]
    public void Dynamic_bindings_and_typed_objects_and_numeric_extensions_keep_their_existing_modes()
    {
        var inputs = new JObject
        {
            ["variable"] = new JObject { ["varKey"] = "@value:Name", ["value"] = "fallback" },
            ["resource"] = new JObject { ["file"] = " files\\name.txt ", ["varKey"] = "ignored", ["value"] = "fallback" },
            ["object"] = new JObject { ["value"] = LosslessProgramJson.ParseObject("{\"text\":\"@var:Name\",\"future\":0.123456789012345678901,\"int64\":9223372036854775807}") },
            ["array"] = new JObject { ["value"] = new JArray("@file:Name", true, 3) },
            ["integer"] = new JObject { ["value"] = long.MaxValue },
            ["boolean"] = new JObject { ["value"] = true },
        };
        var objectValue = inputs["object"]!["value"]!.DeepClone();
        var arrayValue = inputs["array"]!["value"]!.DeepClone();
        InputParamWireCoercer.CompactInputParamsObject(inputs);
        Assert.AreEqual("@value:Name", inputs["variable.var"]!.Value<string>());
        Assert.AreEqual("files/name.txt", inputs["resource.file"]!.Value<string>());
        InputParamWireCoercer.ExpandInputParamsObject(inputs);
        Assert.AreEqual("@value:Name", inputs["variable"]!["varKey"]!.Value<string>());
        Assert.AreEqual("files/name.txt", inputs["resource"]!["file"]!.Value<string>());
        Assert.IsTrue(JToken.DeepEquals(objectValue, inputs["object"]!["value"]));
        Assert.IsTrue(JToken.DeepEquals(arrayValue, inputs["array"]!["value"]));
        Assert.AreEqual(long.MaxValue, inputs["integer"]!["value"]!.Value<long>());
        Assert.AreEqual(true, inputs["boolean"]!["value"]!.Value<bool>());
        StringAssert.Contains(inputs.ToString(), "0.123456789012345678901");
    }

    [TestMethod]
    public void Production_compression_then_program_parser_keeps_literal_and_variable_meanings_distinct()
    {
        var steps = new JArray(new JObject
        {
            ["stepRunnerKey"] = "future:runner",
            ["inputParams"] = new JObject
            {
                ["literal"] = new JObject { ["value"] = "@var:Name" },
                ["escape"] = new JObject { ["value"] = "@value:Name" },
                ["variable"] = new JObject { ["varKey"] = "Name" },
            },
        });
        var catalog = new StepRunnerCatalog();
        var compressed = XActionCompressor.Compress(steps, new JArray(), catalog, omitDefaultLiteralInputs: false);
        Assert.AreEqual("@value:@var:Name", compressed["steps"]![0]!["inputs"]!.Value<string>("literal"));
        Assert.AreEqual("@value:@value:Name", compressed["steps"]![0]!["inputs"]!.Value<string>("escape"));
        var parsed = XActionDataJsonParser.ParseProgramBody((JArray)compressed["steps"]!, new JArray());
        Assert.AreEqual("@var:Name", parsed.Steps[0].InputParams["literal"].Value);
        Assert.AreEqual("@value:Name", parsed.Steps[0].InputParams["escape"].Value);
        Assert.AreEqual("Name", parsed.Steps[0].InputParams["variable"].VarKey);
    }

    [TestMethod]
    public void Native_yaml_source_keeps_literal_prefixes_and_opaque_numbers_during_an_unrelated_edit()
    {
        var native = LosslessProgramJson.ParseObject("""
            {"Variables":[],"Steps":[{"StepRunnerKey":"future:runner","StepId":"s","Note":"before",
            "InputParams":{"literal":{"Value":"@var:Name","Future":0.123456789012345678901},
            "escape":{"Value":"@value:Name"},"path":{"Value":"@file:Name"},"emptyEscape":{"Value":"@value:"},"dynamic":{"VarKey":"Name","Value":""}},
            "FutureStep":9223372036854775807}],"FutureRoot":1e999}
            """);
        var original = V1ProgramSourceCodec.FromNative(native);
        ProgramSourceCodec.RequireLosslessRoundtrip(original);
        var decoded = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(original));
        decoded["steps"]![0]!["note"] = "after";
        var expected = (JObject)native.DeepClone();
        expected["Steps"]![0]!["Note"] = "after";
        var saved = V1ProgramSourceCodec.ToNative(decoded, native, original);
        Assert.IsTrue(JToken.DeepEquals(expected, saved), saved.ToString());
        StringAssert.Contains(saved.ToString(), "0.123456789012345678901");
        StringAssert.Contains(saved.ToString(), "9223372036854775807");
        StringAssert.Contains(saved.ToString(), "1e999");
    }
}
