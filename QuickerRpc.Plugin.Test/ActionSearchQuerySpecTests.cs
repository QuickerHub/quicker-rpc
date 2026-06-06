using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionSearchQuerySpecTests
{
    [TestMethod]
    public void TryParse_legacy_keyword()
    {
        Assert.IsTrue(ActionSearchQuerySpec.TryParse("剪贴板", out var spec, out var error));
        Assert.IsNull(error);
        Assert.IsFalse(spec.IsJsonQuery);
        Assert.AreEqual("剪贴板", spec.Keyword);
    }

    [TestMethod]
    public void TryParse_json_filter_and_sorter()
    {
        const string json = """
            {
              "filter": "action.Source == \"library\"",
              "sorter": { "script": "action.Title" },
              "desc": true
            }
            """;

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out var error));
        Assert.IsNull(error);
        Assert.IsTrue(spec.IsJsonQuery);
        Assert.AreEqual("action.Source == \"library\"", spec.FilterScript);
        Assert.AreEqual("action.Title", spec.SorterScript);
        Assert.IsTrue(spec.SortDescending);
    }

    [TestMethod]
    public void TryParse_json_source_and_keyword()
    {
        const string json = """{"source":"library","keyword":"wolai"}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(ActionSourceFilterKind.Library, spec.SourceFilter?.Kind);
        Assert.AreEqual("wolai", spec.Keyword);
    }

    [TestMethod]
    public void TryParse_json_uses_subprogram()
    {
        const string json = """{"uses":"QuickerRpc_Run","usesOnly":true}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual("QuickerRpc_Run", spec.SubProgramSearch?.SubProgramRef);
        Assert.IsTrue(spec.SubProgramSearch?.DedicatedOnly);
    }

    [TestMethod]
    public void TryParse_rejects_invalid_json()
    {
        Assert.IsFalse(ActionSearchQuerySpec.TryParse("{bad", out _, out var error));
        Assert.IsFalse(string.IsNullOrWhiteSpace(error));
    }
}
