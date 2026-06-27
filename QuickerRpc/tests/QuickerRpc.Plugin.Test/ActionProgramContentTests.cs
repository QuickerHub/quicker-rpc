using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionProgramContentTests
{
    [TestMethod]
    public void HasProgramContent_false_for_empty_arrays()
    {
        const string json = "{\"steps\":[],\"variables\":[],\"subPrograms\":[]}";
        Assert.IsFalse(ActionProgramContent.HasProgramContent(json));
    }

    [TestMethod]
    public void IsXActionBody_true_for_empty_arrays()
    {
        const string json = "{\"steps\":[],\"variables\":[],\"subPrograms\":[]}";
        Assert.IsTrue(ActionProgramContent.IsXActionBody(json));
    }

    [TestMethod]
    public void IsXActionBody_true_for_pascal_case_empty_body()
    {
        const string json = "{\"Steps\":[],\"Variables\":[],\"SubPrograms\":[]}";
        Assert.IsTrue(ActionProgramContent.IsXActionBody(json));
    }

    [TestMethod]
    public void IsXActionBody_false_for_null_or_invalid()
    {
        Assert.IsFalse(ActionProgramContent.IsXActionBody(null));
        Assert.IsFalse(ActionProgramContent.IsXActionBody(""));
        Assert.IsFalse(ActionProgramContent.IsXActionBody("{"));
        Assert.IsFalse(ActionProgramContent.IsXActionBody("{\"foo\":1}"));
    }
}
