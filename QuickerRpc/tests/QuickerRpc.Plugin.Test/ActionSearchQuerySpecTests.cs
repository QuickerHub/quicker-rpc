using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
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
    public void TryParse_json_filter_and_sort_object()
    {
        const string json = """
            {
              "filter": "action.Source == \"library\"",
              "sort": { "script": "action.Title", "desc": true }
            }
            """;

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out var error));
        Assert.IsNull(error);
        Assert.IsTrue(spec.IsJsonQuery);
        Assert.AreEqual("action.Source == \"library\"", spec.FilterScript);
        Assert.AreEqual(1, spec.SortRules.Count);
        Assert.AreEqual("action.Title", spec.SortRules[0].Script);
        Assert.IsTrue(spec.SortRules[0].Descending);
    }

    [TestMethod]
    public void TryParse_json_sort_array()
    {
        const string json = """
            {
              "sort": [
                { "script": "action.ExeFile" },
                { "script": "action.EditMs", "desc": true }
              ]
            }
            """;

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(2, spec.SortRules.Count);
        Assert.AreEqual("action.ExeFile", spec.SortRules[0].Script);
        Assert.IsFalse(spec.SortRules[0].Descending);
        Assert.AreEqual("action.EditMs", spec.SortRules[1].Script);
        Assert.IsTrue(spec.SortRules[1].Descending);
    }

    [TestMethod]
    public void TryParse_json_sort_shorthand_last_edit_desc()
    {
        const string json = """{"sort":"lastEdit.desc"}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(1, spec.SortRules.Count);
        Assert.AreEqual("action.EditMs", spec.SortRules[0].Script);
        Assert.IsTrue(spec.SortRules[0].Descending);
    }

    [TestMethod]
    public void TryParse_json_sort_shorthand_array()
    {
        const string json = """{"sort":["exeFile.asc","lastEdit.desc"]}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(2, spec.SortRules.Count);
        Assert.AreEqual("action.ExeFile", spec.SortRules[0].Script);
        Assert.IsFalse(spec.SortRules[0].Descending);
        Assert.AreEqual("action.EditMs", spec.SortRules[1].Script);
        Assert.IsTrue(spec.SortRules[1].Descending);
    }

    [TestMethod]
    public void TryParse_json_sort_unknown_string_stays_script()
    {
        const string json = """{"sort":"action.Source == \"library\""}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual("action.Source == \"library\"", spec.SortRules[0].Script);
    }
    [TestMethod]
    public void TryParse_json_legacy_sorter_and_root_desc()
    {
        const string json = """
            {
              "sorter": { "script": "action.Title" },
              "desc": true
            }
            """;

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(1, spec.SortRules.Count);
        Assert.AreEqual("action.Title", spec.SortRules[0].Script);
        Assert.IsTrue(spec.SortRules[0].Descending);
    }

    [TestMethod]
    public void TryParse_json_unified_filter_object()
    {
        const string json = """
            {
              "filter": {
                "source": "library",
                "keyword": "wolai",
                "uses": "QuickerRpc_Run",
                "usesOnly": true,
                "script": "action.ExeFile == \"chrome.exe\""
              },
              "sort": { "key": "lastEdit.desc" }
            }
            """;

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out var error));
        Assert.IsNull(error);
        Assert.AreEqual(ActionSourceFilterKind.Library, spec.SourceFilter?.Kind);
        Assert.AreEqual("wolai", spec.Keyword);
        Assert.AreEqual("QuickerRpc_Run", spec.SubProgramSearch?.SubProgramRef);
        Assert.IsTrue(spec.SubProgramSearch?.DedicatedOnly);
        Assert.AreEqual("action.ExeFile == \"chrome.exe\"", spec.FilterScript);
        Assert.AreEqual("action.EditMs", spec.SortRules[0].Script);
        Assert.IsTrue(spec.SortRules[0].Descending);
    }

    [TestMethod]
    public void TryParse_json_sort_object_by_array()
    {
        const string json = """{"sort":{"by":["exeFile.asc","lastEdit.desc"]}}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(2, spec.SortRules.Count);
    }
    [TestMethod]
    public void TryParse_json_source_and_keyword_legacy_top_level()
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

    [TestMethod]
    public void TryParse_json_fields_array()
    {
        const string json = """{"keyword":"clip","fields":["id","title","profileName"]}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out var error));
        Assert.IsNull(error);
        CollectionAssert.AreEqual(
            new[] { "actionId", "title", "profileName" },
            spec.Fields.ToArray());
    }

    [TestMethod]
    public void TryParse_json_select_all()
    {
        const string json = """{"fields":"*"}""";

        Assert.IsTrue(ActionSearchQuerySpec.TryParse(json, out var spec, out _));
        Assert.AreEqual(ActionSummaryFieldCatalog.AllFields.Count, spec.Fields.Count);
    }
}
