using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class ModuleHelpSchemaTests
{
    [TestMethod]
    public void Actual_v2_reflection_reads_optional_native_help_without_reconstructing_it()
    {
        Assert.IsNull(QuickerRpc.Plugin.V2.Reflection.QuickerV2StepRunnerMapper.MapRunner(new LegacyRunner())!.HelpLink);
        var source = new ModernRunner();
        var mapped = QuickerRpc.Plugin.V2.Reflection.QuickerV2StepRunnerMapper.MapRunner(source)!;
        Assert.AreEqual(source.HelpLink, mapped.HelpLink);
    }

    private class LegacyRunner { public string Key => "fixture:help"; public string Name => "Help"; }
    private sealed class ModernRunner : LegacyRunner { public string HelpLink => "https://docs.example.test/native#parameters"; }

    [TestMethod]
    public void Native_help_survives_ui_mapping_but_agent_schema_is_byte_identical()
    {
        var runner = new StepRunnerDefinition { Key = "fixture:help", Name = "Help" };
        var catalog = new StepRunnerCatalog { Items = new List<StepRunnerDefinition> { runner } };
        var without = StepRunnerCatalogMapper.GetDetail(catalog, runner.Key).Schema!;
        var agentBefore = StepRunnerAgentSchemaJson.Serialize(without);
        Assert.IsFalse(StepRunnerUiSchemaJson.Serialize(without).Contains("helpLink"));
        runner.HelpLink = " https://docs.example.test/module?mode=one#parameters ";
        var with = StepRunnerCatalogMapper.GetDetail(catalog, runner.Key).Schema!;
        StringAssert.Contains(StepRunnerUiSchemaJson.Serialize(with), "\"helpLink\":\"https://docs.example.test/module?mode=one#parameters\"");
        Assert.AreEqual(agentBefore, StepRunnerAgentSchemaJson.Serialize(with));
        Assert.AreEqual(runner.HelpLink, " https://docs.example.test/module?mode=one#parameters ");
    }
}
