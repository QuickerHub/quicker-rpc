using System;
using System.Linq;
using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FontAwesomeIconPageTests
{
    private static readonly string[] Catalog = new[] { "Brands_Camera", "Brands_Google", "Light_AddressBook", "Light_Camera", "Regular_Camera", "Solid_Camera", "Solid_CameraRetro" };

    [TestMethod]
    public void Empty_query_pages_actual_styles_and_deprioritizes_brands_without_collapsing()
    {
        var first = FontAwesomeIconPageSearch.Search(Catalog, null, null, -9, 3);
        CollectionAssert.AreEqual(new[] { "Light_AddressBook", "Light_Camera", "Regular_Camera" }, first.Names.ToArray());
        Assert.AreEqual(7, first.TotalCount); Assert.AreEqual(0, first.Skip); Assert.AreEqual(3, first.Take); Assert.IsTrue(first.HasMore);
        Assert.AreEqual("", first.Query); Assert.IsNull(first.Style);
        var last = FontAwesomeIconPageSearch.Search(Catalog, "", "", 6, 3);
        CollectionAssert.AreEqual(new[] { "Brands_Google" }, last.Names.ToArray()); Assert.IsFalse(last.HasMore);
        var outside = FontAwesomeIconPageSearch.Search(Catalog, "", "", int.MaxValue, int.MaxValue);
        Assert.AreEqual(0, outside.Names.Count); Assert.AreEqual(7, outside.TotalCount); Assert.AreEqual(300, outside.Take); Assert.IsFalse(outside.HasMore);
        Assert.AreEqual(96, FontAwesomeIconPageSearch.Search(Catalog, "", "", 0, 0).Take);
    }

    [TestMethod]
    public void Style_alias_criteria_echo_and_scoring_match_the_source_window_contract()
    {
        var brands = FontAwesomeIconPageSearch.Search(Catalog, " camera ", " Brand ");
        CollectionAssert.AreEqual(new[] { "Brands_Camera" }, brands.Names.ToArray());
        Assert.AreEqual("camera", brands.Query); Assert.AreEqual("Brands", brands.Style);
        CollectionAssert.AreEqual(new[] { "Regular_Camera" }, FontAwesomeIconPageSearch.Search(Catalog, "CAMERA", "regular").Names.ToArray());
        Assert.AreEqual(0, FontAwesomeIconPageSearch.Search(Catalog, "", "future-style").TotalCount);
        CollectionAssert.AreEqual(new[] { "Light_Camera", "Regular_Camera", "Solid_Camera", "Brands_Camera", "Solid_CameraRetro" },
            FontAwesomeIconPageSearch.Search(Catalog, "camera", null).Names.ToArray());
        Assert.AreEqual(135, FontAwesomeIconPageSearch.Score("Solid_AddressBook", "address book"));
        Assert.AreEqual(49, FontAwesomeIconPageSearch.Score("Solid_AddressBook", "address unknown"));
        Assert.AreEqual(80, FontAwesomeIconPageSearch.Score("Light_Folder", "文件夹"));
        Assert.IsTrue(FontAwesomeIconPageSearch.Score("Light_Camera", "相机") > 0);
        Assert.AreEqual(0, FontAwesomeIconPageSearch.Score("Light_Camera", "unmatched-xyz"));
    }

    [TestMethod]
    public void Full_filtered_total_is_not_legacy_200_limit_and_catalog_owners_do_not_share_a_cache()
    {
        var names = Enumerable.Range(0, 1001).Select(index => "Light_Number" + index.ToString("D4")).ToArray();
        var page = FontAwesomeIconPageSearch.Search(names, "number", "Light", 400, 300);
        Assert.AreEqual(1001, page.TotalCount); Assert.AreEqual(300, page.Names.Count); Assert.AreEqual("Light_Number0400", page.Names[0]); Assert.IsTrue(page.HasMore);
        var other = FontAwesomeIconPageSearch.Search(new[] { "Light_NumberOther" }, "number", "Light", 0, 300);
        Assert.AreEqual(1, other.TotalCount); Assert.AreEqual("Light_NumberOther", other.Names[0]);
        Assert.AreEqual(1001, FontAwesomeIconPageSearch.Search(names, "number", "Light", 1000, 300).TotalCount);
        var legacy = FontAwesomeIconSearch.Search(names.Select(name => new FontAwesomeIconEntry { Name = name, Style = "Light", Icon = "fa:" + name }).ToArray(), null, 999, expand: true);
        Assert.AreEqual(200, legacy.Names.Count); Assert.AreEqual(200, legacy.MatchCount);
    }

    [TestMethod]
    public void Actual_v1_enum_catalog_uses_paging_and_leaves_legacy_search_unchanged()
    {
        var root = Environment.GetEnvironmentVariable("QKRPC_V1_TEST_HOST_ROOT");
        if (string.IsNullOrWhiteSpace(root)) Assert.Inconclusive("Set QKRPC_V1_TEST_HOST_ROOT to an explicit compile host directory; only its FontAwesomeIconsWpf enum/attributes assembly is loaded.");
        var file = Path.Combine(root!, "FontAwesomeIconsWpf.dll");
        Assert.AreEqual("FontAwesomeIconsWpf", AssemblyName.GetAssemblyName(file).Name);
        Assembly.LoadFrom(file);
        var service = new FontAwesomeIconSearchService();
        Assert.IsTrue(service.IsPageAvailable);
        var before = service.Search("camera", 40, expand: false);
        var page = service.SearchPage("", null, 0, 300);
        Assert.IsTrue(page.Success, page.ErrorMessage); Assert.IsTrue(page.TotalCount > 300); Assert.AreEqual(300, page.Names.Count); Assert.IsTrue(page.HasMore);
        Assert.IsFalse(page.Names.Contains("None"));
        var chinese = service.SearchPage("文件夹", "Regular", 0, 12);
        Assert.IsTrue(chinese.Success, chinese.ErrorMessage); Assert.IsTrue(chinese.TotalCount > 0); Assert.IsTrue(chinese.Names.All(name => name.StartsWith("Regular_", StringComparison.Ordinal)));
        var after = service.Search("camera", 40, expand: false);
        Assert.AreEqual(before.MatchCount, after.MatchCount); Assert.AreEqual(before.DefaultStyle, after.DefaultStyle);
        CollectionAssert.AreEqual(before.Names.ToArray(), after.Names.ToArray());
    }
}
