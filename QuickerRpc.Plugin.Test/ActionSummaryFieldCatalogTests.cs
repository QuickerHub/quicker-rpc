using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionSummaryFieldCatalogTests
{
    [TestMethod]
    public void TryNormalize_maps_aliases_and_dedupes()
    {
        Assert.IsTrue(
            ActionSummaryFieldCatalog.TryNormalize(
                new[] { "id", "title", "pageTitle", "id" },
                out var normalized,
                out var error));
        Assert.IsNull(error);
        CollectionAssert.AreEqual(new[] { "actionId", "title", "profileName" }, normalized.ToArray());
    }

    [TestMethod]
    public void ProjectItem_returns_only_requested_fields()
    {
        Assert.IsTrue(
            ActionSummaryFieldCatalog.TryNormalize(
                new[] { "actionId", "title", "source" },
                out var fields,
                out _));

        var item = new QuickerRpcActionSummaryItem
        {
            ActionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20",
            Title = "Demo",
            Description = "hidden",
            Source = "local",
        };

        var row = ActionSummaryFieldCatalog.ProjectItem(item, fields);
        CollectionAssert.AreEqual(new[] { "actionId", "title", "source" }, row.Keys.ToArray());
        Assert.AreEqual("Demo", row["title"]);
        Assert.IsFalse(row.ContainsKey("description"));
    }

    [TestMethod]
    public void FormatTsvLine_escapes_tabs()
    {
        Assert.IsTrue(
            ActionSummaryFieldCatalog.TryNormalize(new[] { "title" }, out var fields, out _));
        var item = new QuickerRpcActionSummaryItem { Title = "a\tb" };
        Assert.AreEqual("\"a\tb\"", ActionSummaryFieldCatalog.FormatTsvLine(item, fields));
    }
}
