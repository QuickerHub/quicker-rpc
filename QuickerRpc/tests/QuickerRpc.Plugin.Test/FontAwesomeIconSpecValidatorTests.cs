using System;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FontAwesomeIconSpecValidatorTests
{
    private static readonly HashSet<string> Catalog = new(StringComparer.Ordinal)
    {
        "Light_Flask",
        "Brands_Google",
    };

    [TestMethod]
    public void Valid_spec_without_catalog()
    {
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryValidate("fa:Light_Flask", allowEmpty: false, null, out var err));
        Assert.IsNull(err);
    }

    [TestMethod]
    public void Valid_spec_with_color()
    {
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryValidate("fa:Light_Flask:#3b82f6", allowEmpty: false, null, out _));
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryValidate("fa:Light_Flask:#fff", allowEmpty: false, null, out _));
    }

    [TestMethod]
    public void Empty_allowed_when_configured()
    {
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryValidate("", allowEmpty: true, null, out _));
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryValidate("  ", allowEmpty: true, null, out _));
    }

    [TestMethod]
    public void Rejects_missing_fa_prefix()
    {
        Assert.IsFalse(FontAwesomeIconSpecValidator.TryValidate("Light_Flask", allowEmpty: false, null, out var err));
        StringAssert.Contains(err, "fa:");
    }

    [TestMethod]
    public void Rejects_unknown_enum_when_catalog_provided()
    {
        Assert.IsFalse(
            FontAwesomeIconSpecValidator.TryValidate("fa:Light_NotInCatalog", allowEmpty: false, Catalog, out var err));
        StringAssert.Contains(err, "Unknown icon enum");
        StringAssert.Contains(err, "fa search");
    }

    [TestMethod]
    public void Accepts_known_enum_in_catalog()
    {
        Assert.IsTrue(
            FontAwesomeIconSpecValidator.TryValidate("fa:Brands_Google", allowEmpty: false, Catalog, out _));
    }

    [TestMethod]
    public void Rejects_bad_color()
    {
        Assert.IsFalse(
            FontAwesomeIconSpecValidator.TryValidate("fa:Light_Flask:3b82f6", allowEmpty: false, null, out var err));
        StringAssert.Contains(err, "color");
    }
}
