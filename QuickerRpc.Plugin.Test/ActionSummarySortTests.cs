using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionSummarySortTests
{
    [TestMethod]
    public void Resolve_empty_query_defaults_to_lastEdit()
    {
        Assert.AreEqual(
            ActionSummarySortMode.LastEditDesc,
            ActionSummarySort.Resolve(sort: null, queryIsEmpty: true));
    }

    [TestMethod]
    public void Resolve_with_query_defaults_to_relevance()
    {
        Assert.AreEqual(
            ActionSummarySortMode.Relevance,
            ActionSummarySort.Resolve(sort: null, queryIsEmpty: false));
    }

    [DataTestMethod]
    [DataRow("lastEdit")]
    [DataRow("last-edit")]
    [DataRow("recent")]
    [DataRow("edit")]
    public void Resolve_explicit_lastEdit_aliases(string sort)
    {
        Assert.AreEqual(
            ActionSummarySortMode.LastEditDesc,
            ActionSummarySort.Resolve(sort, queryIsEmpty: false));
    }

    [TestMethod]
    public void ClampLimit_clamps_to_1_200()
    {
        Assert.AreEqual(30, ActionSummarySort.ClampLimit(0));
        Assert.AreEqual(200, ActionSummarySort.ClampLimit(500));
        Assert.AreEqual(1, ActionSummarySort.ClampLimit(1));
        Assert.AreEqual(30, ActionSummarySort.ClampLimit(-1));
    }

    [TestMethod]
    public void ToApiValue_round_trips_known_modes()
    {
        Assert.AreEqual("lastEdit", ActionSummarySort.ToApiValue(ActionSummarySortMode.LastEditDesc));
        Assert.AreEqual("title", ActionSummarySort.ToApiValue(ActionSummarySortMode.TitleAsc));
        Assert.AreEqual("relevance", ActionSummarySort.ToApiValue(ActionSummarySortMode.Relevance));
    }
}
