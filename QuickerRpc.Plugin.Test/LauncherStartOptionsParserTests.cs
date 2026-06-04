using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class LauncherStartOptionsParserTests
{
    [TestMethod]
    public void Parse_plugin_mode_is_silent_without_agent()
    {
        var options = LauncherStartOptionsParser.Parse("plugin");
        Assert.IsFalse(options.LaunchQuickerAgent);
        Assert.IsTrue(options.Silent);
    }

    [TestMethod]
    public void Parse_rpc_and_bootstrap_aliases_match_plugin()
    {
        foreach (var mode in new[] { "rpc", "bootstrap", "PLUGIN" })
        {
            var options = LauncherStartOptionsParser.Parse(mode);
            Assert.IsFalse(options.LaunchQuickerAgent, mode);
            Assert.IsTrue(options.Silent, mode);
        }
    }

    [TestMethod]
    public void Parse_agent_mode_launches_agent_with_ui()
    {
        var options = LauncherStartOptionsParser.Parse("agent");
        Assert.IsTrue(options.LaunchQuickerAgent);
        Assert.IsFalse(options.Silent);
    }

    [TestMethod]
    public void Parse_empty_defaults_to_agent_for_manual_run()
    {
        var options = LauncherStartOptionsParser.Parse(null);
        Assert.IsTrue(options.LaunchQuickerAgent);
        Assert.IsFalse(options.Silent);

        options = LauncherStartOptionsParser.Parse("   ");
        Assert.IsTrue(options.LaunchQuickerAgent);
        Assert.IsFalse(options.Silent);
    }
}
