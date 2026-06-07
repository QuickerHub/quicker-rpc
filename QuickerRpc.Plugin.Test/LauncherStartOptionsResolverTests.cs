using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class LauncherStartOptionsResolverTests
{
    // Matches Quicker.Domain.Actions.Runtime.ActionTrigger (probe Quicker.exe or .ref/Quicker).
    private const int Extern = 15;
    private const int AutoRun = 16;
    private const int Panel = 1;

    [TestMethod]
    public void Resolve_extern_is_plugin_only_with_version_notify()
    {
        var options = LauncherStartOptionsResolver.Resolve(Extern);
        Assert.IsFalse(options.LaunchQuickerAgent);
        Assert.IsTrue(options.Silent);
        Assert.IsTrue(options.NotifyPluginVersion);
    }

    [TestMethod]
    public void Resolve_auto_run_is_silent_plugin_only_without_version_notify()
    {
        var options = LauncherStartOptionsResolver.Resolve(AutoRun);
        Assert.IsFalse(options.LaunchQuickerAgent);
        Assert.IsTrue(options.Silent);
        Assert.IsFalse(options.NotifyPluginVersion);
    }

    [TestMethod]
    public void Resolve_panel_click_launches_agent()
    {
        var options = LauncherStartOptionsResolver.Resolve(Panel);
        Assert.IsTrue(options.LaunchQuickerAgent);
        Assert.IsFalse(options.Silent);
        Assert.IsFalse(options.NotifyPluginVersion);
    }

    [TestMethod]
    public void Resolve_extern_overrides_agent_quicker_in_param()
    {
        var options = LauncherStartOptionsResolver.Resolve(Extern, quickerInParam: "agent");
        Assert.IsFalse(options.LaunchQuickerAgent);
        Assert.IsTrue(options.NotifyPluginVersion);
    }

    [TestMethod]
    public void Resolve_panel_honors_plugin_mode_in_param()
    {
        var options = LauncherStartOptionsResolver.Resolve(Panel, quickerInParam: "plugin");
        Assert.IsFalse(options.LaunchQuickerAgent);
        Assert.IsTrue(options.Silent);
        Assert.IsFalse(options.NotifyPluginVersion);
    }

    [TestMethod]
    public void Resolve_panel_honors_agent_kill_in_param()
    {
        var options = LauncherStartOptionsResolver.Resolve(Panel, quickerInParam: "agent-kill");
        Assert.IsTrue(options.KillQuickerAgent);
        Assert.IsFalse(options.LaunchQuickerAgent);
    }
}
