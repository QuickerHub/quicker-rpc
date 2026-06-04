using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerAgentKeywordCoverageTests
{
    private const int ExpectedEntryCount = 143;

    [TestMethod]
    public void AgentKeywordCatalog_has_full_live_catalog_coverage_count()
    {
        Assert.AreEqual(ExpectedEntryCount, StepRunnerAgentKeywordCatalog.All.Count);
    }

    [TestMethod]
    public void AgentKeywordCatalog_every_entry_has_keywords_and_snippet()
    {
        foreach (var kv in StepRunnerAgentKeywordCatalog.All)
        {
            var entry = kv.Value;
            if (entry.Obsolete)
            {
                continue;
            }

            Assert.IsTrue(entry.Keywords.Count > 0, "Empty keywords for " + kv.Key);
            Assert.IsFalse(string.IsNullOrWhiteSpace(entry.Snippet), "Empty snippet for " + kv.Key);
        }
    }

    [TestMethod]
    public void AgentKeywordCatalog_new_extension_modules_have_snippets()
    {
        string[] extensionKeys =
        {
            "sys:httpserver",
            "sys:smtp",
            "sys:jsonExtract",
            "sys:enc",
            "sys:excelreadwrite",
            "sys:chromecontrol",
        };

        foreach (var key in extensionKeys)
        {
            Assert.IsTrue(StepRunnerAgentKeywordCatalog.TryGet(key, out var entry), key);
            Assert.IsFalse(string.IsNullOrWhiteSpace(entry.Snippet), key);
        }
    }

}
