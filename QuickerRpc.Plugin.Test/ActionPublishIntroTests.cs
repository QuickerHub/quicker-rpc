using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionPublishIntroTests
{
    [TestMethod]
    public void NoteToDetailHtml_wraps_plain_text_in_paragraph()
    {
        var html = ActionPublishIntro.NoteToDetailHtml("Hello world");
        Assert.AreEqual("<p>Hello world</p>", html);
    }

    [TestMethod]
    public void NoteToDetailHtml_preserves_existing_html()
    {
        const string input = "<p>Already HTML</p>";
        Assert.AreEqual(input, ActionPublishIntro.NoteToDetailHtml(input));
    }

    [TestMethod]
    public void ResolveDetailHtml_ignores_note_and_requires_explicit_html()
    {
        Assert.IsNull(ActionPublishIntro.ResolveDetailHtml(null, "note"));
        Assert.AreEqual("<p>A</p>", ActionPublishIntro.ResolveDetailHtml("<p>A</p>", "note"));
    }
}
