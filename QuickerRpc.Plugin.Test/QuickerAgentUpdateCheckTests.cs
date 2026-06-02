using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class SemVerUtilityTests
{
    [TestMethod]
    public void Compare_treats_remote_as_newer()
    {
        Assert.IsTrue(SemVerUtility.Compare("0.8.6", "0.8.2") > 0);
    }

    [TestMethod]
    public void Compare_treats_equal_versions_as_not_newer()
    {
        Assert.AreEqual(0, SemVerUtility.Compare("0.8.2", "0.8.2"));
        Assert.IsTrue(SemVerUtility.Compare("0.8.2", "0.8.6") < 0);
    }

    [TestMethod]
    public void TryParse_accepts_v_prefix_and_three_segments()
    {
        Assert.IsTrue(SemVerUtility.TryParse("v1.2.3", out var version));
        Assert.AreEqual(1, version.Major);
        Assert.AreEqual(2, version.Minor);
        Assert.AreEqual(3, version.Build);
    }
}

[TestClass]
public sealed class QuickerAgentUpdateCheckServiceTests
{
    [TestMethod]
    public void BuildVersionedDownloadUrl_uses_bitiful_prefix()
    {
        var url = QuickerAgentUpdateCheckService.BuildVersionedDownloadUrl("0.8.6");
        StringAssert.Contains(url, "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/");
        StringAssert.Contains(url, "quicker-agent-0.8.6-x64-setup.exe");
    }
}
