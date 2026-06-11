using System;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionDocFormParserTests
{
    [TestMethod]
    public void TryParse_reads_detail_textarea_and_hidden_fields()
    {
        const string html = """
            <html><body>
            <form action="/Member/Action/Edit?id=abc" method="post">
              <input type="hidden" name="__RequestVerificationToken" value="token123" />
              <input type="text" name="SharedActionVm.Title" value="My Action" />
              <textarea id="SharedActionVm_Detail" name="SharedActionVm.Detail">&lt;p&gt;Hello&lt;/p&gt;</textarea>
              <button type="submit" class="btn btn-primary">更新动作信息</button>
            </form>
            </body></html>
            """;

        var ok = ActionDocFormParser.TryParse(
            html,
            "https://getquicker.net/Member/Action/Edit?id=abc",
            out var form,
            out var error);

        Assert.IsTrue(ok, error);
        Assert.IsNotNull(form);
        Assert.AreEqual("<p>Hello</p>", form!.DetailHtml);
        Assert.IsTrue(form.Fields.ContainsKey("__RequestVerificationToken"));
        Assert.AreEqual("token123", form.Fields["__RequestVerificationToken"]);
    }

    [TestMethod]
    public void BuildUrlEncodedBody_encodes_html()
    {
        var body = ActionDocFormParser.BuildUrlEncodedBody(
            new Dictionary<string, string>
            {
                ["SharedActionVm.Detail"] = "<p>测试</p>",
            });

        StringAssert.Contains(body, "SharedActionVm.Detail=");
        StringAssert.Contains(body, "%3Cp%3E");
    }

    [TestMethod]
    public void TryParse_ignores_search_form_and_reads_edit_form()
    {
        const string html = """
            <html><body>
            <form action="/Search" method="get">
              <input type="text" name="q" value="decoy" />
            </form>
            <form action="/Member/Action/Edit?id=abc" method="post">
              <input type="hidden" name="__RequestVerificationToken" value="token123" />
              <input type="file" name="SharedActionVm.File" />
              <textarea id="SharedActionVm_Detail" name="SharedActionVm.Detail">&lt;p&gt;Hello&lt;/p&gt;</textarea>
            </form>
            </body></html>
            """;

        var ok = ActionDocFormParser.TryParse(
            html,
            "https://getquicker.net/Member/Action/Edit?id=abc",
            out var form,
            out var error);

        Assert.IsTrue(ok, error);
        Assert.IsNotNull(form);
        Assert.IsFalse(form!.Fields.ContainsKey("q"));
        Assert.AreEqual("<p>Hello</p>", form.DetailHtml);
        CollectionAssert.Contains(form.FileFieldNames, "SharedActionVm.File");
    }

    [TestMethod]
    public void Detail_only_update_preserves_all_other_parsed_fields()
    {
        const string html = """
            <html><body>
            <form action="/Member/Action/Edit?id=abc" method="post">
              <input type="hidden" name="__RequestVerificationToken" value="token123" />
              <input type="hidden" name="SharedActionVm.Id" value="abc-guid" />
              <input type="text" name="SharedActionVm.Title" value="统计用户动作点赞" />
              <textarea name="SharedActionVm.Description">统计GetQuicker用户动作页点赞数</textarea>
              <input type="hidden" name="SharedActionVm.IsPublic" value="false" />
              <input type="checkbox" name="SharedActionVm.IsPublic" value="true" checked="checked" />
              <input type="hidden" name="SharedActionVm.ExeFile" value="common" />
              <input type="text" name="SharedActionVm.Keywords" value="点赞,统计" />
              <input type="text" name="SharedActionVm.Tags" value="tool" />
              <input type="text" name="SharedActionVm.CharacterInfoDict.depd_3rdLibs" value="" />
              <textarea id="SharedActionVm_Detail" name="SharedActionVm.Detail">&lt;p&gt;Old detail&lt;/p&gt;</textarea>
              <input type="file" name="SharedActionVm.File" />
            </form>
            </body></html>
            """;

        var ok = ActionDocFormParser.TryParse(
            html,
            "https://getquicker.net/Member/Action/Edit?id=abc",
            out var form,
            out var error);

        Assert.IsTrue(ok, error);
        Assert.IsNotNull(form);

        var snapshot = new Dictionary<string, string>(form!.Fields, StringComparer.Ordinal);
        snapshot.Remove(ActionDocFormParser.DetailFieldName);

        const string newDetail = "<p>New detail only</p>";
        form.Fields[ActionDocFormParser.DetailFieldName] = newDetail;

        foreach (var pair in snapshot)
        {
            Assert.IsTrue(
                form.Fields.TryGetValue(pair.Key, out var current),
                $"Field '{pair.Key}' missing after detail update.");
            Assert.AreEqual(
                pair.Value,
                current,
                $"Field '{pair.Key}' changed when only Detail should be updated.");
        }

        Assert.AreEqual(newDetail, form.Fields[ActionDocFormParser.DetailFieldName]);
        Assert.AreEqual("true", form.Fields["SharedActionVm.IsPublic"]);
        Assert.AreEqual("common", form.Fields["SharedActionVm.ExeFile"]);
    }

    [TestMethod]
    public void TryExtractPublishFormAction_reads_btnPublish_formaction()
    {
        const string html = """
            <form action="/Member/Action/Edit?id=abc" method="post">
              <input type="submit" id="btnPublish" formaction="/Member/Action/Edit?id=abc&amp;handler=Publish" value="保存并发布到动作库" />
            </form>
            """;

        var url = ActionDocFormParser.TryExtractPublishFormAction(
            html,
            "https://getquicker.net/Member/Action/Edit?id=abc");

        Assert.IsNotNull(url);
        StringAssert.Contains(url!, "handler=Publish");
    }

    [TestMethod]
    public void BuildMultipartBody_includes_detail_and_empty_file_parts()
    {
        var form = new ActionDocFormParser.ParsedForm();
        form.Fields["SharedActionVm.Detail"] = "<p>测试</p>";
        form.Fields["__RequestVerificationToken"] = "token";
        form.FileFieldNames.Add("SharedActionVm.File");

        var (body, boundary) = ActionDocFormParser.BuildMultipartBody(form);
        var text = System.Text.Encoding.UTF8.GetString(body);

        StringAssert.Contains(text, boundary);
        StringAssert.Contains(text, "name=\"SharedActionVm.Detail\"");
        StringAssert.Contains(text, "<p>测试</p>");
        StringAssert.Contains(text, "name=\"SharedActionVm.File\"; filename=\"\"");
    }
}
