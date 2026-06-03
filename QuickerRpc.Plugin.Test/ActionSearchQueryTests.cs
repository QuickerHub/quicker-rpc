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
}
