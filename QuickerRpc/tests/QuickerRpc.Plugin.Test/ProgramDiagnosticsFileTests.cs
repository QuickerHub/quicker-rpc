using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramDiagnosticsFileTests
{
    [TestMethod]
    public void ComputeDataFingerprint_changes_when_script_file_changes()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-fp-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "files"));
        var dataPath = Path.Combine(root, "data.json");
        var scriptPath = Path.Combine(root, "files", "run.cs");
        File.WriteAllText(dataPath, "{\"steps\":[]}");
        File.WriteAllText(scriptPath, "v1");

        var before = ProgramDiagnosticsFile.ComputeDataFingerprint(root);
        File.WriteAllText(scriptPath, "v2");
        var after = ProgramDiagnosticsFile.ComputeDataFingerprint(root);

        Assert.AreNotEqual(before, after);
    }

    [TestMethod]
    public void ComputeDataFingerprint_unchanged_when_only_unrelated_files_change()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-fp-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "files"));
        var dataPath = Path.Combine(root, "data.json");
        File.WriteAllText(dataPath, "{\"steps\":[]}");

        var before = ProgramDiagnosticsFile.ComputeDataFingerprint(root);
        File.WriteAllText(Path.Combine(root, "notes.txt"), "ignore me");
        var after = ProgramDiagnosticsFile.ComputeDataFingerprint(root);

        Assert.AreEqual(before, after);
    }

    [TestMethod]
    public void IsStale_detects_script_only_edit_with_same_data_json()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-fp-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "files"));
        Directory.CreateDirectory(Path.Combine(root, ".qkrpc"));
        var dataPath = Path.Combine(root, "data.json");
        var scriptPath = Path.Combine(root, "files", "run.cs");
        File.WriteAllText(dataPath, "{\"steps\":[]}");
        File.WriteAllText(scriptPath, "v1");

        var fingerprint = ProgramDiagnosticsFile.ComputeDataFingerprint(root);
        var doc = new ProgramDiagnosticsDocument
        {
            DataFingerprint = fingerprint,
            Status = "ready",
        };
        ProgramDiagnosticsFile.Write(root, doc);

        File.WriteAllText(scriptPath, "v2");
        var read = ProgramDiagnosticsFile.ReadOrDefault(root);

        Assert.IsTrue(ProgramDiagnosticsFile.IsStale(read, root, editVersion: null));
    }
}
