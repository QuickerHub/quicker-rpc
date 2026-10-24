using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionPresentationUpdateTests
{
    [TestMethod]
    public void Native_alpha_icon_survives_the_real_V1_presentation_validator()
    {
        const string spec = "fa:Light_Flask:#80112233";
        var action = new global::Quicker.Common.ActionItem();
        Assert.IsTrue(ActionPresentationUpdate.TryApply(action, null, null, spec, null, out var error), error);
        Assert.AreEqual(spec, action.Icon);
    }

    [TestMethod]
    public void Native_alpha_geometry_keeps_spec_and_color_in_the_native_domain()
    {
        const string spec = "fa:Light_Flask:#80112233";
        var service = new FontAwesomeIconSearchService();
        Assert.IsTrue(service.TryResolveGeometry(spec, out var geometry, out var error), error);
        Assert.AreEqual(spec, geometry!.Spec);
        Assert.AreEqual("#80112233", geometry.Color);
        Assert.IsTrue(geometry.Width > 0 && geometry.Height > 0 && geometry.Path.Length > 0);
    }

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
