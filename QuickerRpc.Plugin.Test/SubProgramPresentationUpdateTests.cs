using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class SubProgramPresentationUpdateTests
{
    [TestMethod]
    public void ReadOptionalPatchName_prefers_title_over_name()
    {
        var patch = JObject.Parse("""{"title":"FromTitle","name":"FromName"}""");
        Assert.AreEqual("FromTitle", SubProgramPresentationUpdate.ReadOptionalPatchName(patch));
    }

    [TestMethod]
    public void TryApply_updates_name_description_icon()
    {
        var sp = new SubProgram { Name = "old", Description = "", Icon = "" };
        Assert.IsTrue(
            SubProgramPresentationUpdate.TryApply(sp, "NewName", "desc", "fa:Light_Code", out var error),
            error);
        Assert.AreEqual("NewName", sp.Name);
        Assert.AreEqual("desc", sp.Description);
        Assert.AreEqual("fa:Light_Code", sp.Icon);
    }
}
