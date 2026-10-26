using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionSaveAttemptTests
{
    [TestMethod]
    public void Conversion_failure_is_known_not_persisted_and_never_calls_native_save()
    {
        var nativeCalls = 0;
        var success = ActionSaveAttempt.TrySave<int>(
            () => throw new TargetInvocationException(new InvalidOperationException("conversion failed")),
            _ => nativeCalls++, out var error, out var persisted);

        Assert.IsFalse(success);
        Assert.AreEqual(false, persisted);
        Assert.AreEqual("conversion failed", error);
        Assert.AreEqual(0, nativeCalls);
    }

    [TestMethod]
    public void Native_commit_then_throw_remains_unknown_and_is_not_replayed()
    {
        var committed = false;
        var nativeCalls = 0;
        var success = ActionSaveAttempt.TrySave(() => "prepared", value =>
        {
            Assert.AreEqual("prepared", value);
            nativeCalls++;
            committed = true;
            throw new TargetInvocationException(new InvalidOperationException("after commit"));
        }, out var error, out var persisted);

        Assert.IsFalse(success);
        Assert.IsTrue(committed);
        Assert.IsNull(persisted);
        Assert.AreEqual("after commit", error);
        Assert.AreEqual(1, nativeCalls);
    }

    [TestMethod]
    public void Normal_native_return_is_known_persisted()
    {
        var nativeCalls = 0;
        var success = ActionSaveAttempt.TrySave(() => 7, value =>
        {
            Assert.AreEqual(7, value);
            nativeCalls++;
        }, out var error, out var persisted);

        Assert.IsTrue(success);
        Assert.AreEqual(true, persisted);
        Assert.IsNull(error);
        Assert.AreEqual(1, nativeCalls);
    }

    [TestMethod]
    public void Missing_native_api_is_known_not_persisted_and_does_not_convert()
    {
        var converted = false;
        var success = ActionSaveAttempt.TrySave(() =>
        {
            converted = true;
            return 7;
        }, nativeSave: null, out var error, out var persisted);

        Assert.IsFalse(success);
        Assert.AreEqual(false, persisted);
        Assert.IsFalse(converted);
        Assert.AreEqual("SaveEditingAction unavailable.", error);
    }
}
