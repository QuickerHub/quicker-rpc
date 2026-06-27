using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class WorkspaceSubProgramLoadTests
{
    [TestMethod]
    public void TryLoadSubProgram_loads_dep_download_from_repo_workspace()
    {
        var root = WorkspaceActionTestEnvironment.ResolveWorkspaceRoot();
        var subRoot = Path.Combine(root, ".quicker", "subprograms");
        if (!Directory.Exists(subRoot))
        {
            Assert.Inconclusive($"No .quicker/subprograms at {root}");
        }

        var load = WorkspaceActionTestEnvironment.TryLoadSubProgram(
            WorkspaceDependencyDownloadIds.MixedModeV2,
            root);
        Assert.IsTrue(load.Success, load.ErrorMessage);
        Assert.IsNotNull(load.Project);
        Assert.IsTrue(load.Project!.CompiledData["steps"] is Newtonsoft.Json.Linq.JArray steps && steps.Count > 0);
    }
}
