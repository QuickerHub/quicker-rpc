using System;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FontAwesomeIconSearchTests
{
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
        Assert.AreEqual(3, result.MatchCount);
        Assert.AreEqual("Brands_Google", result.Names[0]);
        Assert.AreEqual("Light_AddressBook", result.Names[1]);
        Assert.AreEqual("Light_Pen", result.Names[2]);
    }

    [TestMethod]
    public void Search_or_pipe_matches_either_branch()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "google|pen", maxResults: 10);
        Assert.AreEqual(2, result.MatchCount);
        Assert.IsTrue(result.Names.Contains("Brands_Google"));
        Assert.IsTrue(result.Names.Contains("Light_Pen"));
    }

    [TestMethod]
    public void Search_wildcard_matches_name_pattern()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "solid *pen", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Light_Pen", result.Names[0]);
    }

    [TestMethod]
    public void Search_legacy_and_requires_all_tokens()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "solid address", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Light_AddressBook", result.Names[0]);
    }
}
