using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerAgentSchemaCompressorTests
{
    private static StepRunnerCatalog CreateWindowOperationsCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:windowOperations",
                    Name = "窗口操作",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "move", Name = "移动窗口" },
                                new() { Value = "move_ex", Name = "移动窗口(增强)" },
                            },
                        },
                        new() { Key = "area", ValidForValues = new List<string> { "move_ex" } },
                    },
                },
            },
        };

    [TestMethod]
    public void Serialize_move_ex_omits_control_options_and_applied_fields()
    {
        var mapped = StepRunnerCatalogMapper.GetDetail(CreateWindowOperationsCatalog(), "sys:windowOperations", "move_ex");
        Assert.IsTrue(mapped.Success);

        var json = StepRunnerAgentSchemaJson.Serialize(mapped.Schema!);

        Assert.IsTrue(json.IndexOf("appliedControlField", System.StringComparison.Ordinal) < 0);
        Assert.IsTrue(json.IndexOf("controlField", System.StringComparison.Ordinal) < 0);
        Assert.IsTrue(json.IndexOf("visibilityFilteringAvailable", System.StringComparison.Ordinal) < 0);
        StringAssert.Contains(json, "\"inputs\"");
        StringAssert.Contains(json, "\"key\":\"type\"");

        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var typeInput = doc.RootElement.GetProperty("inputs").EnumerateArray()
            .First(i => i.GetProperty("key").GetString() == "type");
        Assert.IsFalse(typeInput.TryGetProperty("options", out _));
        Assert.AreEqual("move_ex", typeInput.GetProperty("default").GetString());
    }

    [TestMethod]
    public void Serialize_without_control_field_keeps_controlField_and_short_guidance()
    {
        var mapped = StepRunnerCatalogMapper.GetDetail(CreateWindowOperationsCatalog(), "sys:windowOperations");
        Assert.IsTrue(mapped.Success);

        var json = StepRunnerAgentSchemaJson.Serialize(mapped.Schema!);

        StringAssert.Contains(json, "\"controlField\"");
        StringAssert.Contains(json, "\"agentGuidance\"");
        StringAssert.Contains(json, "--control-field");
        Assert.IsTrue(json.IndexOf("This step has a control field", System.StringComparison.Ordinal) < 0);
    }

    [TestMethod]
    public void Serialize_omits_empty_purpose_and_null_hints()
    {
        var schema = new StepRunnerAgentSchema
        {
            StepRunnerKey = "sys:test",
            Name = "Test",
            Inputs =
            {
                new AgentInputParamSchema
                {
                    Key = "mode",
                    ValueType = "Enum",
                    Options = new List<AgentParamOption>
                    {
                        new() { Key = "a", Name = "A" },
                    },
                },
            },
        };

        var json = StepRunnerAgentSchemaJson.Serialize(schema);

        Assert.IsTrue(json.IndexOf("hint", System.StringComparison.Ordinal) < 0);
        Assert.IsTrue(json.IndexOf("purpose", System.StringComparison.Ordinal) < 0);
    }
}
