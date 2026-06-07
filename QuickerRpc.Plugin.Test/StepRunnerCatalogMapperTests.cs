using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerCatalogMapperTests
{
    private static StepRunnerCatalog CreateWindowOperationsCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:windowOperations",
                    Name = "窗口操作",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "move", Name = "移动窗口" },
                                new() { Value = "move_ex", Name = "移动窗口(增强)" },
                                new() { Value = "show", Name = "设置显示状态" },
                            },
                        },
                        new() { Key = "hWnd" },
                        new() { Key = "x", ValidForValues = new List<string> { "move" } },
                        new() { Key = "y", ValidForValues = new List<string> { "move" } },
                        new() { Key = "width", ValidForValues = new List<string> { "move" } },
                        new() { Key = "height", ValidForValues = new List<string> { "move" } },
                        new() { Key = "area", ValidForValues = new List<string> { "move_ex" } },
                        new() { Key = "showCmd", ValidForValues = new List<string> { "show" } },
                        new() { Key = "stopIfFail" },
                    },
                    OutputParamDefs = new List<StepRunnerOutputParamDef>
                    {
                        new() { Key = "ok", ValidForValues = new List<string> { "move", "move_ex" } },
                        new() { Key = "pos", ValidForValues = new List<string> { "move" } },
                        new() { Key = "region", ValidForValues = new List<string> { "move_ex" } },
                    },
                },
            },
        };

    [TestMethod]
    public void Search_includes_runner_icon()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:form",
                    Name = "多字段表单",
                    Icon = "fa:Light_WindowMaximize",
                },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "form", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("fa:Light_WindowMaximize", result.Items[0].Icon);
    }

    [TestMethod]
    public void GetDetail_includes_runner_icon()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:form",
                    Name = "多字段表单",
                    Icon = "fa:Light_WindowMaximize",
                },
            },
        };

        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:form");

        Assert.IsTrue(result.Success);
        Assert.AreEqual("fa:Light_WindowMaximize", result.Schema!.Icon);
    }

    [TestMethod]
    public void Search_matched_control_selection_sets_control_field_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.Search(catalog, "移动窗口增强", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(1, result.MatchCount);
        var item = result.Items[0];
        Assert.AreEqual("sys:windowOperations", item.Key);
        Assert.IsNotNull(item.ControlField);
        Assert.AreEqual("type", item.ControlField.Key);
        Assert.AreEqual("move_ex", item.ControlField.Value);
        Assert.AreEqual("移动窗口(增强)", item.ControlField.Name);
    }

    [TestMethod]
    public void Search_short_move_query_still_includes_control_field_on_controlled_runner()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.Search(catalog, "移动", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.MatchCount >= 1);
        var item = result.Items.First(i => i.Key == "sys:windowOperations");
        Assert.IsNotNull(item.ControlField, "Non-empty query + control runner must emit controlField.");
        Assert.AreEqual("type", item.ControlField!.Key);
        Assert.IsFalse(string.IsNullOrWhiteSpace(item.ControlField.Value));
    }

    [TestMethod]
    public void Search_non_empty_query_omits_agent_guidance()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.Search(catalog, "移动", maxResults: 10);

        Assert.IsTrue(result.Success);
    }

    [TestMethod]
    public void Search_empty_query_omits_control_field()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.Search(catalog, string.Empty, maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.MatchCount >= 1);
        foreach (var item in result.Items)
        {
            Assert.IsNull(item.ControlField);
        }

    }

    [TestMethod]
    public void GetDetail_move_ex_omits_move_only_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "move_ex");

        Assert.IsTrue(result.Success);
        var keys = result.Schema!.Inputs.Select(i => i.Key).ToList();
        CollectionAssert.Contains(keys, "type");
        CollectionAssert.Contains(keys, "area");
        CollectionAssert.DoesNotContain(keys, "x");
        CollectionAssert.DoesNotContain(keys, "width");
        var outKeys = result.Schema.Outputs.Select(o => o.Key).ToList();
        CollectionAssert.Contains(outKeys, "ok");
        CollectionAssert.Contains(outKeys, "region");
        CollectionAssert.DoesNotContain(outKeys, "pos");
        Assert.AreEqual("move_ex", result.Schema.AppliedControlFieldValue);
        Assert.IsTrue(result.Schema.VisibilityFilteringAvailable);
    }

    [TestMethod]
    public void GetDetail_move_omits_move_ex_only_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "move");

        Assert.IsTrue(result.Success);
        var keys = result.Schema!.Inputs.Select(i => i.Key).ToList();
        CollectionAssert.Contains(keys, "x");
        CollectionAssert.DoesNotContain(keys, "area");
        var outKeys = result.Schema!.Outputs.Select(o => o.Key).ToList();
        CollectionAssert.Contains(outKeys, "pos");
        CollectionAssert.DoesNotContain(outKeys, "region");
    }

    [TestMethod]
    public void GetDetail_invalid_control_value_fails()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "not_a_mode");

        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage!, "Invalid control field value");
        StringAssert.Contains(result.ErrorMessage!, "move_ex");
    }

    [TestMethod]
    public void GetDetail_control_field_selection_includes_visible_input_keys_per_mode()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations");

        Assert.IsTrue(result.Success);
        var selection = result.Schema!.ControlField!.Selection;
        var move = selection.First(s => s.Key == "move");
        var moveEx = selection.First(s => s.Key == "move_ex");

        CollectionAssert.Contains(move.VisibleInputKeys, "x");
        CollectionAssert.Contains(move.VisibleInputKeys, "type");
        CollectionAssert.DoesNotContain(move.VisibleInputKeys, "area");

        CollectionAssert.Contains(moveEx.VisibleInputKeys, "area");
        CollectionAssert.DoesNotContain(moveEx.VisibleInputKeys, "x");

        CollectionAssert.Contains(move.VisibleOutputKeys, "pos");
        CollectionAssert.DoesNotContain(move.VisibleOutputKeys, "region");
        CollectionAssert.Contains(moveEx.VisibleOutputKeys, "region");
    }

    [TestMethod]
    public void GetDetail_without_control_field_includes_guidance()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations");

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.Schema!.Inputs.Count > 5);
        StringAssert.Contains(result.Schema.AgentGuidance!, "--control-field");
    }

    [TestMethod]
    public void GetDetail_webview2_includes_fileExt_on_url_and_script()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:webview2",
                    Name = "WebView2",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new() { Key = "url", IsMultiLine = true },
                        new() { Key = "script", IsMultiLine = true },
                        new() { Key = "title" },
                    },
                },
            },
        };

        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:webview2");
        Assert.IsTrue(result.Success);

        var url = result.Schema!.Inputs.First(i => i.Key == "url");
        var script = result.Schema.Inputs.First(i => i.Key == "script");
        var title = result.Schema.Inputs.First(i => i.Key == "title");

        Assert.AreEqual(".html", url.FileExt);
        Assert.AreEqual(".js", script.FileExt);
        Assert.IsNull(title.FileExt);
    }

    [TestMethod]
    public void GetDetail_runScript_with_BAT_control_sets_script_fileExt()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:runScript",
                    Name = "运行脚本",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "BAT", Name = "BAT" },
                                new() { Value = "PS", Name = "PS" },
                            },
                        },
                        new() { Key = "script", IsMultiLine = true },
                    },
                },
            },
        };

        var withoutControl = StepRunnerCatalogMapper.GetDetail(catalog, "sys:runScript");
        Assert.IsTrue(withoutControl.Success);
        var scriptOpen = withoutControl.Schema!.Inputs.First(i => i.Key == "script");
        StringAssert.Contains(scriptOpen.FileExt!, "BAT");

        var withBat = StepRunnerCatalogMapper.GetDetail(catalog, "sys:runScript", "BAT");
        Assert.IsTrue(withBat.Success);
        var scriptBat = withBat.Schema!.Inputs.First(i => i.Key == "script");
        Assert.AreEqual(".bat", scriptBat.FileExt);
    }

    [TestMethod]
    public void GetDetail_evalexpression_includes_eval_cs_fileExt()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:evalexpression",
                    Name = "表达式",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new() { Key = "expression", IsMultiLine = true },
                    },
                },
            },
        };

        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:evalexpression");
        Assert.IsTrue(result.Success);
        Assert.AreEqual(".eval.cs", result.Schema!.Inputs[0].FileExt);
    }
}
