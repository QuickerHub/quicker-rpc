using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionSearchQueryTests
{
    [TestMethod]
    public void TryParseSubProgramReference_uses_prefix()
    {
        Assert.IsTrue(ActionSearchQuery.TryParseSubProgramReference("uses:CeaCore_Run", out var parsed));
        Assert.AreEqual("CeaCore_Run", parsed.SubProgramRef);
        Assert.IsFalse(parsed.DedicatedOnly);
    }

    [TestMethod]
    public void TryParseSubProgramReference_ref_prefix()
    {
        Assert.IsTrue(ActionSearchQuery.TryParseSubProgramReference("ref:MySub", out var parsed));
        Assert.AreEqual("MySub", parsed.SubProgramRef);
        Assert.IsFalse(parsed.DedicatedOnly);
    }

    [TestMethod]
    public void TryParseSubProgramReference_uses_only_prefix()
    {
        Assert.IsTrue(ActionSearchQuery.TryParseSubProgramReference("uses-only:CeaCore_Run", out var parsed));
        Assert.AreEqual("CeaCore_Run", parsed.SubProgramRef);
        Assert.IsTrue(parsed.DedicatedOnly);
    }

    [TestMethod]
    public void TryParseSubProgramReference_call_identifier()
    {
        Assert.IsTrue(
            ActionSearchQuery.TryParseSubProgramReference(
                "uses:%%b7fec5d4-f80a-443a-b904-170f5986c598",
                out var parsed));
        Assert.AreEqual("%%b7fec5d4-f80a-443a-b904-170f5986c598", parsed.SubProgramRef);
    }

    [TestMethod]
    public void TryParseSubProgramReference_rejects_plain_keyword()
    {
        Assert.IsFalse(ActionSearchQuery.TryParseSubProgramReference("clipboard", out _));
    }

    [TestMethod]
    public void TryParseSubProgramReference_rejects_empty_target()
    {
        Assert.IsFalse(ActionSearchQuery.TryParseSubProgramReference("uses:", out _));
    }

    [TestMethod]
    public void TryParseSourceFilter_library_prefix()
    {
        Assert.IsTrue(ActionSearchQuery.TryParseSourceFilter("source:library", out var parsed, out var keyword));
        Assert.AreEqual(ActionSourceFilterKind.Library, parsed.Kind);
        Assert.AreEqual(string.Empty, keyword);
    }

    [TestMethod]
    public void TryParseSourceFilter_library_with_keyword()
    {
        Assert.IsTrue(ActionSearchQuery.TryParseSourceFilter("installed:剪贴板", out var parsed, out var keyword));
        Assert.AreEqual(ActionSourceFilterKind.Library, parsed.Kind);
        Assert.AreEqual("剪贴板", keyword);
    }

    [TestMethod]
    public void TryParseSourceFilter_shared_id()
    {
        Assert.IsTrue(
            ActionSearchQuery.TryParseSourceFilter(
                "shared:f5c76108-3ce9-433f-8cd0-8f0d9c562052 测试",
                out var parsed,
                out var keyword));
        Assert.AreEqual(ActionSourceFilterKind.SharedId, parsed.Kind);
        Assert.AreEqual("f5c76108-3ce9-433f-8cd0-8f0d9c562052", parsed.SharedId);
        Assert.AreEqual("测试", keyword);
    }

    [TestMethod]
    public void TryParseSubProgramReference_after_source_filter()
    {
        Assert.IsTrue(
            ActionSearchQuery.TryParseSubProgramReference(
                "source:local uses:CeaCore_Run",
                out var parsed));
        Assert.AreEqual("CeaCore_Run", parsed.SubProgramRef);
    }
}
