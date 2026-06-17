using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class QkrpcAgentInstallSelectionTests
{
    [TestMethod]
    public void ParseChoices_DefaultsToCursor()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices(null, true, false, false, false, null);
        Assert.IsTrue(selection.Cursor);
        Assert.IsFalse(selection.Codex);
    }

    [TestMethod]
    public void ParseChoices_MultipleHosts()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices("1,2", true, false, false, false, null);
        Assert.IsTrue(selection.Cursor);
        Assert.IsTrue(selection.Codex);
        Assert.IsFalse(selection.Claude);
    }

    [TestMethod]
    public void ParseChoices_AllHosts()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices("7", true, false, false, false, null);
        Assert.IsTrue(selection.AllHosts);
    }

    [TestMethod]
    public void ToSetupOptions_MapsCodexAndProject()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices("2", true, false, true, true, "D:\\ws");
        var options = selection.ToSetupOptions();
        Assert.IsTrue(options.Codex);
        Assert.IsTrue(options.Project);
        Assert.IsTrue(options.ProjectSkills);
        Assert.AreEqual("D:\\ws", options.Workspace);
        Assert.IsTrue(options.SkipSkill);
        Assert.IsFalse(options.CursorPlugin);
    }

    [TestMethod]
    public void ToSetupOptions_CursorMapsToPlugin()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices("1", false, false, false, false, null);
        var options = selection.ToSetupOptions();
        Assert.IsFalse(options.Cursor);
        Assert.IsTrue(options.CursorPlugin);
        Assert.IsTrue(options.SkipSkill);
    }

    [TestMethod]
    public void ToSetupOptions_CodexMapsToPlugin()
    {
        var selection = QkrpcAgentInstallSelection.ParseChoices("2", false, false, false, false, null);
        var options = selection.ToSetupOptions();
        Assert.IsTrue(options.Codex);
        Assert.IsTrue(options.CodexPlugin);
        Assert.IsFalse(options.CursorPlugin);
    }
}
