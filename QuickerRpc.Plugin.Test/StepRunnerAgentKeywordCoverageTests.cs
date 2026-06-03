using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
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
    public void AgentKeywordCatalog_covers_modules_table_except_deprecated_assign()
    {
        var tablePath = FindModulesTablePath();
        Assert.IsNotNull(tablePath, "step-modules.modules-table.md not found");

        var md = File.ReadAllText(tablePath!);
        var keys = Regex.Matches(md, @"sys:[a-zA-Z0-9_-]+")
            .Cast<Match>()
            .Select(m => m.Value)
            .Distinct()
            .Where(k => !string.Equals(k, "sys:assign", StringComparison.Ordinal))
            .ToList();

        foreach (var key in keys)
        {
            Assert.IsTrue(
                StepRunnerAgentKeywordCatalog.TryGet(key, out var entry),
                "Missing keywords for " + key);
            Assert.IsTrue(entry.Keywords.Count > 0, "Empty keywords for " + key);
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

    private static string? FindModulesTablePath()
    {
        var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        for (var i = 0; i < 8 && dir is not null; i++, dir = Path.GetDirectoryName(dir))
        {
            var candidate = Path.Combine(
                dir,
                "docs",
                "action-authoring-src",
                "references",
                "step-modules.modules-table.md");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
