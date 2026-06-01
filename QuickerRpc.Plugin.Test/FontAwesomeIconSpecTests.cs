using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FontAwesomeIconSpecTests
{
    [TestMethod]
    public void Format_enum_name_without_color()
    {
        Assert.AreEqual("fa:Light_Flask", FontAwesomeIconSpec.Format("Light_Flask"));
        Assert.AreEqual("fa:Brands_Google", FontAwesomeIconSpec.Format("Brands_Google"));
    }

    [TestMethod]
    public void Format_with_color_adds_hash_and_second_colon()
    {
        Assert.AreEqual("fa:Light_Flask:#3b82f6", FontAwesomeIconSpec.Format("Light_Flask", "3b82f6"));
        Assert.AreEqual("fa:Light_Flask:#ff0000", FontAwesomeIconSpec.Format("Light_Flask", "#ff0000"));
    }

    [TestMethod]
    public void Format_strips_existing_fa_prefix()
    {
        Assert.AreEqual("fa:Light_Flask", FontAwesomeIconSpec.Format("fa:Light_Flask"));
        Assert.AreEqual("fa:Light_Flask:#00ff00", FontAwesomeIconSpec.Format("fa:Light_Flask", "#00ff00"));
    }
}
