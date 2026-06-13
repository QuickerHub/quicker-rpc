using System;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FontAwesomeIconSearchTests
{
    [TestInitialize]
    public void ResetIconSearchIndex() => FontAwesomeIconSearchIndex.Reset();

    private static readonly FontAwesomeIconEntry[] SampleCatalog =
    [
        new()
        {
            Name = "Solid_AddressBook",
            Style = "Solid",
            Label = "Address Book",
            Unicode = 62137,
            Icon = "fa:Solid_AddressBook",
        },
        new()
        {
            Name = "Regular_AddressBook",
            Style = "Regular",
            Label = "Address Book",
            Unicode = 62137,
            Icon = "fa:Regular_AddressBook",
        },
        new()
        {
            Name = "Light_AddressBook",
            Style = "Light",
            Label = "Address Book",
            Unicode = 62137,
            Icon = "fa:Light_AddressBook",
        },
        new()
        {
            Name = "Brands_Google",
            Style = "Brands",
            Label = "Google",
            Unicode = 61656,
            Icon = "fa:Brands_Google",
        },
        new()
        {
            Name = "Solid_Pen",
            Style = "Solid",
            Label = "Pen",
            Unicode = 61484,
            Icon = "fa:Solid_Pen",
        },
        new()
        {
            Name = "Light_ClipboardList",
            Style = "Light",
            Label = "Clipboard List",
            Unicode = 62583,
            Icon = "fa:Light_ClipboardList",
        },
        new()
        {
            Name = "Light_ListOl",
            Style = "Light",
            Label = "List Ol",
            Unicode = 61642,
            Icon = "fa:Light_ListOl",
        },
        new()
        {
            Name = "Light_Sort",
            Style = "Light",
            Label = "Sort",
            Unicode = 61660,
            Icon = "fa:Light_Sort",
        },
    ];

    [TestMethod]
    public void ToShortGlyphName_strips_style_prefix()
    {
        Assert.AreEqual("AddressBook", FontAwesomeIconDedup.ToShortGlyphName("Solid_AddressBook"));
        Assert.AreEqual("Google", FontAwesomeIconDedup.ToShortGlyphName("Brands_Google"));
    }

    [TestMethod]
    public void ToCompressedEnumName_merges_styles_to_light_and_keeps_brands()
    {
        Assert.AreEqual("Light_AddressBook", FontAwesomeIconDedup.ToCompressedEnumName(SampleCatalog[2]));
        Assert.AreEqual("Light_Pen", FontAwesomeIconDedup.ToCompressedEnumName(SampleCatalog[4]));
        Assert.AreEqual("Brands_Google", FontAwesomeIconDedup.ToCompressedEnumName(SampleCatalog[3]));
        Assert.AreEqual("fa:Light_Pen", FontAwesomeIconSpec.Format("Light_Pen"));
    }

    [TestMethod]
    public void Search_dedupes_styles_and_returns_light_prefixed_name()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "address book", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Light_AddressBook", result.Names[0]);
        Assert.AreEqual("fa:Light_AddressBook", FontAwesomeIconSpec.Format(result.Names[0]));
    }

    [TestMethod]
    public void Collapse_prefers_light_row_when_scores_tie()
    {
        var ranked = SampleCatalog
            .Where(e => e.Name.Contains("AddressBook", StringComparison.Ordinal))
            .Select(e => (e, 100))
            .ToList();
        var names = FontAwesomeIconDedup.CollapseToEnumNames(ranked, 10);
        Assert.AreEqual(1, names.Count);
        Assert.AreEqual("Light_AddressBook", names[0]);
    }

    [TestMethod]
    public void Search_expand_returns_full_enum_names()
    {
        var result = FontAwesomeIconSearch.Search(
            SampleCatalog,
            "address book",
            maxResults: 10,
            expand: true);
        Assert.AreEqual(3, result.MatchCount);
        Assert.IsTrue(result.Names.Contains("Solid_AddressBook"));
        Assert.IsTrue(result.Names.Contains("Regular_AddressBook"));
        Assert.IsTrue(result.Names.Contains("Light_AddressBook"));
    }

    [TestMethod]
    public void Search_matches_brands_enum_name()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "Brands_Google", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Brands_Google", result.Names[0]);
        Assert.AreEqual("fa:Brands_Google", FontAwesomeIconSpec.Format(result.Names[0]));
    }

    [TestMethod]
    public void Search_empty_query_lists_compressed_enum_names()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, string.Empty, maxResults: 10);
        Assert.AreEqual(6, result.MatchCount);
        Assert.AreEqual("Brands_Google", result.Names[0]);
        Assert.AreEqual("Light_AddressBook", result.Names[1]);
        Assert.AreEqual("Light_ClipboardList", result.Names[2]);
    }

    [TestMethod]
    public void Search_pipe_and_wildcard_are_token_separators_not_operators()
    {
        var orResult = FontAwesomeIconSearch.Search(SampleCatalog, "google|pen", maxResults: 10);
        Assert.AreEqual(2, orResult.MatchCount);
        Assert.IsTrue(orResult.Names.Contains("Brands_Google"));
        Assert.IsTrue(orResult.Names.Contains("Light_Pen"));

        var penResult = FontAwesomeIconSearch.Search(SampleCatalog, "solid *pen", maxResults: 10);
        Assert.IsTrue(penResult.MatchCount >= 1);
        Assert.AreEqual("Light_Pen", penResult.Names[0]);
    }

    [TestMethod]
    public void Search_legacy_and_requires_all_tokens()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "solid address", maxResults: 10);
        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("Light_AddressBook", result.Names[0]);
    }

    [TestMethod]
    public void Search_token_index_matches_any_keyword_and_ranks_by_coverage()
    {
        var result = FontAwesomeIconSearch.Search(
            SampleCatalog,
            "sort arrows lines list",
            maxResults: 10);
        Assert.IsTrue(result.MatchCount > 0);
        Assert.IsTrue(result.Names.Contains("Light_ClipboardList"));
        Assert.IsTrue(result.Names.Contains("Light_ListOl"));
        Assert.IsTrue(result.Names.Contains("Light_Sort"));
    }

    [TestMethod]
    public void Search_token_index_partial_keywords_not_zero()
    {
        var result = FontAwesomeIconSearch.Search(
            SampleCatalog,
            "clipboard text sort",
            maxResults: 10);
        Assert.IsTrue(result.MatchCount > 0);
        Assert.IsTrue(result.Names.Contains("Light_ClipboardList"));
        Assert.IsTrue(result.Names.Contains("Light_Sort"));
    }
}
