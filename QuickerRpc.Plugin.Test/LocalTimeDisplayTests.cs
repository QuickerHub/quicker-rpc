using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.LocalTime;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class LocalTimeDisplayTests
{
    [TestMethod]
    public void NormalizeUtcIso_appends_Z_when_offset_missing()
    {
        Assert.AreEqual(
            "2026-06-01T07:10:00.0000000Z",
            LocalTimeDisplay.NormalizeUtcIso("2026-06-01T07:10:00.0000000"));
    }

    [TestMethod]
    public void TryParseUtc_unspecified_iso_is_utc_not_local()
    {
        Assert.IsTrue(
            LocalTimeDisplay.TryParseUtc("2026-06-01T15:10:00.0000000", out var dto));
        Assert.AreEqual(15, dto.UtcDateTime.Hour);
        Assert.AreEqual(TimeSpan.Zero, dto.Offset);
    }
}
