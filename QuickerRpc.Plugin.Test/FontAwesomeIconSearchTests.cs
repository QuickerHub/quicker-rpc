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
    public void Normalize_strips_spaces_dashes_and_fa_prefix_chars()
    {
        Assert.AreEqual("solidaddressbook", FontAwesomeIconSearch.Normalize("Solid_AddressBook"));
        Assert.AreEqual("addressbook", FontAwesomeIconSearch.Normalize("address book"));
        Assert.AreEqual("fasolidaddressbook", FontAwesomeIconSearch.Normalize("fa:Solid_AddressBook"));
    }

    [TestMethod]
    public void Search_dedupes_styles_to_solid_by_default()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "address book", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Solid_AddressBook", result.Names[0]);
    }

    [TestMethod]
    public void Search_all_styles_returns_every_variant()
    {
        var result = FontAwesomeIconSearch.Search(
            SampleCatalog,
            "address book",
            maxResults: 10,
            includeAllStyles: true);
        Assert.AreEqual(3, result.MatchCount);
        Assert.IsTrue(result.Names.Contains("Solid_AddressBook"));
        Assert.IsTrue(result.Names.Contains("Regular_AddressBook"));
        Assert.IsTrue(result.Names.Contains("Light_AddressBook"));
    }

    [TestMethod]
    public void Search_matches_enum_name()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "Brands_Google", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Brands_Google", result.Names[0]);
    }

    [TestMethod]
    public void Search_empty_query_lists_alphabetically_deduped()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, string.Empty, maxResults: 10);
        Assert.AreEqual(3, result.MatchCount);
        Assert.AreEqual("Brands_Google", result.Names[0]);
        Assert.AreEqual("Solid_AddressBook", result.Names[1]);
        Assert.AreEqual("Solid_Pen", result.Names[2]);
    }

    [TestMethod]
    public void Search_or_pipe_matches_either_branch()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "google|pen", maxResults: 10);
        Assert.AreEqual(2, result.MatchCount);
        Assert.IsTrue(result.Names.Contains("Brands_Google"));
        Assert.IsTrue(result.Names.Contains("Solid_Pen"));
    }

    [TestMethod]
    public void Search_wildcard_matches_name_pattern()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "solid *pen", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Solid_Pen", result.Names[0]);
    }

    [TestMethod]
    public void Search_legacy_and_requires_all_tokens()
    {
        var result = FontAwesomeIconSearch.Search(SampleCatalog, "solid address", maxResults: 10);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("Solid_AddressBook", result.Names[0]);
    }
}
