using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class WorkspaceProgramCompatibilityTests
{
    [TestMethod]
    public void Normalize_migrates_defaultValueFile_to_defaultValue_file()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = "urls",
                    ["type"] = 0,
                    ["defaultValueFile"] = "files/urls-default1.txt",
                },
            },
            ["steps"] = new JArray(),
        };

        var fixes = WorkspaceProgramCompatibility.Normalize(data);

        Assert.AreEqual(1, fixes.Count);
        StringAssert.Contains(fixes[0], "variables[urls]");
        StringAssert.Contains(fixes[0], "defaultValueFile");
        var variable = (JObject)data["variables"]![0]!;
        Assert.AreEqual("files/urls-default1.txt", variable["defaultValue"]!["file"]!.Value<string>());
        Assert.IsNull(variable["defaultValueFile"]);
    }

    [TestMethod]
    public void Normalize_noop_when_defaultValue_already_has_file()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = "urls",
                    ["defaultValue"] = new JObject { ["file"] = "files/urls-default1.txt" },
                },
            },
        };

        var fixes = WorkspaceProgramCompatibility.Normalize(data);

        Assert.AreEqual(0, fixes.Count);
        Assert.IsNull(((JObject)data["variables"]![0]!)["defaultValueFile"]);
    }

    [TestMethod]
    public void Normalize_noop_when_only_inline_defaultValue()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = "n",
                    ["defaultValue"] = "42",
                },
            },
        };

        Assert.AreEqual(0, WorkspaceProgramCompatibility.Normalize(data).Count);
    }

    [TestMethod]
    public void Normalize_injects_empty_defaultValue_for_text_variable()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "clipText" },
            },
        };

        var fixes = WorkspaceProgramCompatibility.Normalize(data);

        Assert.AreEqual(1, fixes.Count);
        StringAssert.Contains(fixes[0], "defaultValue");
        Assert.AreEqual(string.Empty, ((JObject)data["variables"]![0]!)["defaultValue"]?.Value<string>());
    }
}
