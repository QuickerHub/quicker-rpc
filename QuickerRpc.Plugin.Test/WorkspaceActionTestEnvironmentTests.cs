using System;
using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class WorkspaceActionTestEnvironmentTests
{
    private static string FixtureProjectDirectory =>
        Path.Combine(GetFixturesRoot(), WorkspaceActionTestSettings.FixtureName);

    private static string GetFixturesRoot()
    {
        var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
            ?? AppDomain.CurrentDomain.BaseDirectory;
        return Path.Combine(dir, "Fixtures", "workspace-actions");
    }

    [TestMethod]
    public void TryLoad_fixture_compiles_evalexpression_action()
    {
        var load = WorkspaceActionTestEnvironment.TryLoadFromDirectory(FixtureProjectDirectory);
        Assert.IsTrue(load.Success, load.ErrorMessage);
        Assert.IsNotNull(load.Project);

        var steps = load.Project!.CompiledData["steps"] as Newtonsoft.Json.Linq.JArray;
        Assert.IsNotNull(steps);
        Assert.IsTrue(steps!.Count > 0, "fixture should have steps");
        StringAssert.Contains(steps[0]!["stepRunnerKey"]!.ToString(), "evalexpression");
    }

    [TestMethod]
    public void ListActionProjects_finds_action_under_quicker_actions()
    {
        var workspace = Path.Combine(Path.GetTempPath(), "qkrpc-ws-list-" + Guid.NewGuid().ToString("N"));
        var actionId = Guid.NewGuid().ToString();
        var projectDir = QuickerRpc.AgentModel.XAction.Project.QuickerProjectLayout.GetActionProjectDirectory(
            actionId,
            workspace);
        try
        {
            Directory.CreateDirectory(projectDir);
            File.Copy(
                Path.Combine(FixtureProjectDirectory, "data.json"),
                QuickerRpc.AgentModel.XAction.Project.QuickerProjectLayout.GetDataPath(projectDir));
            File.Copy(
                Path.Combine(FixtureProjectDirectory, "info.json"),
                QuickerRpc.AgentModel.XAction.Project.QuickerProjectLayout.GetInfoPath(projectDir));

            var list = WorkspaceActionTestEnvironment.ListActionProjects(workspace);
            Assert.AreEqual(1, list.Count);
            Assert.IsTrue(list[0].HasData);
            Assert.IsTrue(list[0].StepCount > 0);
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void ResolveWorkspaceRoot_finds_repo_from_test_output()
    {
        var root = WorkspaceActionTestEnvironment.ResolveWorkspaceRoot();
        Assert.IsTrue(
            File.Exists(Path.Combine(root, WorkspaceActionTestEnvironment.RepoRootMarkerFile))
            || Directory.Exists(Path.Combine(root, WorkspaceActionTestEnvironment.PluginProjectDirName)),
            "ResolveWorkspaceRoot should locate quicker-rpc repo.");
    }
}
