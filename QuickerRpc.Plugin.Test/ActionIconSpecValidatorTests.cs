using System;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionIconSpecValidatorTests
{
    private static readonly HashSet<string> Catalog = new(StringComparer.Ordinal)
    {
        "Light_Flask",
    };

    [TestMethod]
    public void Accepts_fa_spec()
    {
        Assert.IsTrue(
            ActionIconSpecValidator.TryValidate("fa:Light_Flask", allowEmpty: false, Catalog, out var err));
        Assert.IsNull(err);
    }

    [TestMethod]
    public void Accepts_https_image_url()
    {
        const string url =
            "https://files.getquicker.net/_icons/ED114190F25E5C2DFD8C245B8F3D2F9DA76E2666.png";
        Assert.IsTrue(ActionIconSpecValidator.TryValidate(url, allowEmpty: false, null, out var err));
        Assert.IsNull(err);
    }

    [TestMethod]
    public void Accepts_http_image_url()
    {
        Assert.IsTrue(
            ActionIconSpecValidator.TryValidate(
                "http://example.com/icon.png",
                allowEmpty: false,
                null,
                out _));
    }

    [TestMethod]
    public void Rejects_relative_path()
    {
        Assert.IsFalse(
            ActionIconSpecValidator.TryValidate(
                "/_icons/foo.png",
                allowEmpty: false,
                null,
                out var err));
        StringAssert.Contains(err, "fa:");
        StringAssert.Contains(err, "http");
    }

    [TestMethod]
    public void Rejects_file_scheme()
    {
        Assert.IsFalse(
            ActionIconSpecValidator.TryValidate(
                "file:///C:/temp/icon.png",
                allowEmpty: false,
                null,
                out _));
    }

    [TestMethod]
    public void Rejects_bare_enum_name()
    {
        Assert.IsFalse(
            ActionIconSpecValidator.TryValidate("Light_Flask", allowEmpty: false, null, out var err));
        StringAssert.Contains(err, "fa:");
    }
}
