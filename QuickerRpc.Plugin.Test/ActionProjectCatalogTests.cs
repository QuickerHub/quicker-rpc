using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionProjectCatalogTests
{
    private static string CreateWorkspace()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-catalog-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    [TestMethod]
    public void DeriveSlugFromTitle_lowercases_ascii_and_keeps_cjk()
    {
        var slug = ActionProjectDirectoryNaming.DeriveSlugFromTitle("QuickerRpc 管理");
        StringAssert.Contains(slug, "quickerrpc");
        StringAssert.Contains(slug, "管理");
    }

    [TestMethod]
    public void DirectoryNameFromActionId_uses_full_guid()
    {
        var actionId = Guid.NewGuid().ToString();
        var dirName = ActionProjectDirectoryNaming.DirectoryNameFromActionId(actionId);
        Assert.AreEqual(actionId.ToLowerInvariant(), dirName.ToLowerInvariant());
    }

    [TestMethod]
    public void AllocateNewProjectDirectory_uses_action_id_as_folder_name()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var projectDir = ActionProjectCatalog.AllocateNewProjectDirectory(
                actionId,
                "My Test Action",
                workspace);
            var dirName = Path.GetFileName(projectDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            Assert.AreEqual(actionId.ToLowerInvariant(), dirName.ToLowerInvariant());
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
    public void FindActionProjectDirectoryByActionId_scans_info_json()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var projectDir = ActionProjectCatalog.AllocateNewProjectDirectory(
                actionId,
                "My Test Action",
                workspace);
            Directory.CreateDirectory(projectDir);
            QuickerProjectFiles.WriteActionInfo(
                projectDir,
                new ActionProjectInfo { Id = actionId, Title = "My Test Action" });
            QuickerProjectFiles.WriteData(
                projectDir,
                new Newtonsoft.Json.Linq.JObject
                {
                    ["steps"] = new Newtonsoft.Json.Linq.JArray(),
                    ["variables"] = new Newtonsoft.Json.Linq.JArray(),
                });

            var found = ActionProjectCatalog.FindActionProjectDirectoryByActionId(actionId, workspace);
            Assert.IsNotNull(found);
            Assert.AreEqual(projectDir, found);
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
    public void ResolveImportProjectDirectory_uses_dir_only_and_reads_id_from_info()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var projectDir = Path.Combine(
                QuickerProjectLayout.GetKindRoot(QuickerProjectKind.Action, workspace),
                "custom-name");
            Directory.CreateDirectory(projectDir);
            QuickerProjectFiles.WriteActionInfo(projectDir, new ActionProjectInfo { Id = actionId });

            var resolved = ActionProjectCatalog.ResolveImportProjectDirectory(
                explicitActionId: null,
                explicitDir: projectDir,
                workspaceRoot: workspace);

            Assert.AreEqual(projectDir, resolved);
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
    public void ResolveExtractProjectDirectory_reuses_existing_directory_for_same_action()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var first = ActionProjectCatalog.ResolveExtractProjectDirectory(
                actionId,
                "Alpha",
                explicitDir: null,
                workspaceRoot: workspace);
            Directory.CreateDirectory(first);
            QuickerProjectFiles.WriteActionInfo(first, new ActionProjectInfo { Id = actionId, Title = "Alpha" });

            var second = ActionProjectCatalog.ResolveExtractProjectDirectory(
                actionId,
                "Beta Renamed",
                explicitDir: null,
                workspaceRoot: workspace);

            Assert.AreEqual(first, second);
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }
}
