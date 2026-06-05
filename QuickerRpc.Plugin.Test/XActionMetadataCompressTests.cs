using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class XActionMetadataCompressTests
{
    [TestMethod]
    public void CompressMetadata_includes_context_menu_data()
    {
        const string menu = "[fa:Light_Cog]设置|settings";
        var compressed = XActionCompressor.CompressMetadata(
            new JArray(),
            new JArray(),
            title: "Test",
            description: "desc",
            icon: "fa:Light_Flask",
            contextMenuData: menu,
            subProgramCount: 0);

        Assert.AreEqual(menu, compressed["contextMenuData"]?.ToString());
        Assert.AreEqual("Test", compressed["title"]?.ToString());
    }

    [TestMethod]
    public void CompressMetadata_emits_empty_context_menu_when_null()
    {
        var compressed = XActionCompressor.CompressMetadata(
            new JArray(),
            new JArray(),
            title: null,
            description: null,
            icon: null,
            contextMenuData: null,
            subProgramCount: 0);

        Assert.AreEqual(string.Empty, compressed["contextMenuData"]?.ToString());
    }
}
