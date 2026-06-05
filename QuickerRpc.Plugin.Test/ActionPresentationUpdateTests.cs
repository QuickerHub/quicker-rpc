using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionPresentationUpdateTests
{
    [TestMethod]
    public void ReadOptionalPatchString_parses_context_menu_from_patch()
    {
        var patch = JObject.Parse("""{"contextMenuData":"快速|quick"}""");
        Assert.AreEqual("快速|quick", ActionPresentationUpdate.ReadOptionalPatchString(patch["contextMenuData"]));
    }

    [TestMethod]
    public void ReadOptionalPatchString_null_token_clears_context_menu()
    {
        var patch = JObject.Parse("""{"contextMenuData":null}""");
        Assert.AreEqual(string.Empty, ActionPresentationUpdate.ReadOptionalPatchString(patch["contextMenuData"]));
    }

    [TestMethod]
    public void MaxContextMenuDataLength_matches_quicker_designer_limit()
    {
        Assert.AreEqual(1500, ActionPresentationUpdate.MaxContextMenuDataLength);
    }
}
