using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class StepRunnerHighlightUiTests
{
    [TestMethod]
    public void Native_highlight_is_optional_ui_metadata_and_does_not_change_agent_json()
    {
        var input = new StepRunnerInputParamDef { Key = "body", VarType = 0, IsMultiLine = true };
        var runner = new StepRunnerDefinition { Key = "fixture:highlight", Name = "Highlight",
            InputParamDefs = new List<StepRunnerInputParamDef> { input } };
        var catalog = new StepRunnerCatalog { Items = new List<StepRunnerDefinition> { runner } };
        var oldSchema = StepRunnerCatalogMapper.GetDetail(catalog, runner.Key).Schema!;
        var agentBefore = StepRunnerAgentSchemaJson.Serialize(oldSchema);
        Assert.IsFalse(StepRunnerUiSchemaJson.Serialize(oldSchema).Contains("defaultHighlightType"));
        input.DefaultHighlightType = " JSON ";
        var schema = StepRunnerCatalogMapper.GetDetail(catalog, runner.Key).Schema!;
        StringAssert.Contains(StepRunnerUiSchemaJson.Serialize(schema), "\"defaultHighlightType\":\"JSON\"");
        Assert.AreEqual(agentBefore, StepRunnerAgentSchemaJson.Serialize(schema));
        Assert.AreEqual(" JSON ", input.DefaultHighlightType);
    }
}
