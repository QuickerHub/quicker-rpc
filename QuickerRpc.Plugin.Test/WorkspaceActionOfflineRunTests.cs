using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class WorkspaceActionOfflineRunTests
{
    static WorkspaceActionOfflineRunTests()
    {
        QuickerAssemblyResolve.EnsureRegistered();
    }

    private static WorkspaceActionTestEnvironment.LoadedProject LoadFixture(string fixtureName)
    {
        var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
            ?? AppDomain.CurrentDomain.BaseDirectory;
        var projectDir = Path.Combine(dir, "Fixtures", "workspace-actions", fixtureName);
        var load = WorkspaceActionTestEnvironment.TryLoadFromDirectory(projectDir);
        Assert.IsTrue(load.Success, load.ErrorMessage);
        return load.Project!;
    }

    private static WorkspaceActionOfflineRunner.Options CreateRunnerOptions() =>
        new() { PackagesRoot = WorkspaceActionTestSettings.PackagesRoot };

    [TestMethod]
    public void OfflineRun_fixture_evalexpression_sets_sum_variable()
    {
        var project = LoadFixture(WorkspaceActionTestSettings.DefaultFixtureName);
        var result = new WorkspaceActionOfflineRunner().Run(project, CreateRunnerOptions());
        AssertOfflineSuccess(result);
        Assert.IsTrue(result.Variables.ContainsKey("sum"), "expected output variable sum");
        Assert.AreEqual(42L, Convert.ToInt64(result.Variables["sum"]));
    }

    [TestMethod]
    public void OfflineRun_dep_download_fixture_resolves_quicker_rpc_dll()
    {
        var packagesRoot = PackageDependencyResolver.ResolveDefaultPackagesRoot();
        var packageDir = Path.Combine(packagesRoot, "quicker.rpc", "0.12.0");
        if (!Directory.Exists(packageDir))
        {
            Assert.Inconclusive($"Local package not found: {packageDir}");
        }

        var project = LoadFixture(WorkspaceActionTestSettings.DepDownloadFixtureName);
        var result = new WorkspaceActionOfflineRunner().Run(
            project,
            new WorkspaceActionOfflineRunner.Options { PackagesRoot = packagesRoot });

        Assert.IsTrue(result.Success, result.ErrorMessage);
        var dllPath = result.Variables["dll_path"]?.ToString();
        Assert.IsFalse(string.IsNullOrWhiteSpace(dllPath));
        StringAssert.Contains(dllPath!, "QuickerRpc.Plugin.");
        Assert.IsTrue(File.Exists(dllPath!), dllPath);
        StringAssert.StartsWith(result.Variables["version"]?.ToString() ?? string.Empty, "0.12.0.");
        Assert.IsTrue(string.Equals("0.12.0", result.Variables["package_version"]?.ToString(), StringComparison.OrdinalIgnoreCase));

        var depStep = result.Steps.FirstOrDefault(s => s.StepId == "s-dep");
        Assert.IsNotNull(depStep);
        Assert.IsTrue(depStep!.Success);
        Assert.IsFalse(depStep.Skipped);
    }

    [TestMethod]
    public void OfflineRun_repo_workspace_action_when_configured()
    {
        var actionKey = WorkspaceActionTestSettings.WorkspaceActionKey;
        if (actionKey is null)
        {
            Assert.Inconclusive("Set QKRPC_WORKSPACE_TEST_ACTION to an action id or folder under .quicker/actions/.");
        }

        var load = WorkspaceActionTestEnvironment.TryLoad(actionKey, WorkspaceActionTestSettings.WorkspaceRoot);
        Assert.IsTrue(load.Success, load.ErrorMessage);

        var result = new WorkspaceActionOfflineRunner().Run(load.Project!, CreateRunnerOptions());
        AssertOfflineSuccess(result);
        Assert.IsTrue(result.Steps.Count > 0, "expected at least one step result");
    }

    private static void AssertOfflineSuccess(WorkspaceActionOfflineRunner.RunResult result)
    {
        if (!result.Success && result.ErrorMessage?.IndexOf("Quicker", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Assert.Inconclusive(result.ErrorMessage + " (install Quicker or set QUICKER_DLL_PATH)");
        }

        if (!result.Success && result.ErrorMessage?.IndexOf("trial", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Assert.Inconclusive(result.ErrorMessage);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage);
    }
}
