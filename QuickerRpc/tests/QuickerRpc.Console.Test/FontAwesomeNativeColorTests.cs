using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class FontAwesomeNativeColorTests
{
    [DataTestMethod]
    [DataRow("#80112233")]
    [DataRow("#FF112233")]
    [DataRow("#00112233")]
    [DataRow("#ffFfBa00")]
    [DataRow("#abc")]
    [DataRow("#a1B2c3")]
    public void Native_hex_is_accepted_without_rewriting_the_spec_or_color(string color)
    {
        var spec = "fa:Light_Flask:" + color;
        Assert.IsTrue(FontAwesomeIconSpecValidator.TryParse(spec, false, out var name, out var parsed, out var error), error);
        Assert.AreEqual("Light_Flask", name);
        Assert.AreEqual(color, parsed);
        Assert.IsTrue(ActionIconSpecValidator.TryValidate(spec, false, new HashSet<string> { name }, out error), error);
    }

    [DataTestMethod]
    [DataRow("#1234")]
    [DataRow("#12345")]
    [DataRow("#1234567")]
    [DataRow("#123456789")]
    [DataRow("#GG112233")]
    [DataRow("80112233")]
    [DataRow("red")]
    [DataRow("success")]
    [DataRow("rgb(1,2,3)")]
    public void New_native_alpha_support_does_not_expand_other_color_syntax(string color)
    {
        Assert.IsFalse(ActionIconSpecValidator.TryValidate("fa:Light_Flask:" + color, false, null, out var error));
        StringAssert.Contains(error, "#AARRGGBB");
    }
}
