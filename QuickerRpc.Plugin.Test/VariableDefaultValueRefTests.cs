using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class VariableDefaultValueRefTests
{
    [TestMethod]
    public void TryGetFilePath_reads_defaultValue_file_object()
    {
        var varObj = new JObject
        {
            ["key"] = "urls",
            ["defaultValue"] = new JObject { ["file"] = "files/a.txt" },
        };

        Assert.IsTrue(VariableDefaultValueRef.TryGetFilePath(varObj, out var path));
        Assert.AreEqual("files/a.txt", path);
    }

    [TestMethod]
    public void TryGetFilePath_reads_legacy_defaultValueFile()
    {
        var varObj = new JObject
        {
            ["key"] = "urls",
            ["defaultValueFile"] = "files/legacy.txt",
        };

        Assert.IsTrue(VariableDefaultValueRef.TryGetFilePath(varObj, out var path));
        Assert.AreEqual("files/legacy.txt", path);
    }

    [TestMethod]
    public void SetFileRef_removes_legacy_property()
    {
        var varObj = new JObject
        {
            ["key"] = "urls",
            ["defaultValueFile"] = "files/legacy.txt",
        };

        VariableDefaultValueRef.SetFileRef(varObj, "files/new.txt");

        Assert.AreEqual("files/new.txt", varObj["defaultValue"]!["file"]!.Value<string>());
        Assert.IsNull(varObj["defaultValueFile"]);
    }

    [TestMethod]
    public void TryGetInlineString_returns_false_for_file_object()
    {
        var varObj = new JObject
        {
            ["defaultValue"] = new JObject { ["file"] = "files/a.txt" },
        };

        Assert.IsFalse(VariableDefaultValueRef.TryGetInlineString(varObj, out _));
    }

    [TestMethod]
    public void MigrateLegacyFileProperty_converts_to_file_object()
    {
        var varObj = new JObject
        {
            ["defaultValueFile"] = "files/old.txt",
        };

        VariableDefaultValueRef.MigrateLegacyFileProperty(varObj);

        Assert.AreEqual("files/old.txt", varObj["defaultValue"]!["file"]!.Value<string>());
        Assert.IsNull(varObj["defaultValueFile"]);
    }
}
