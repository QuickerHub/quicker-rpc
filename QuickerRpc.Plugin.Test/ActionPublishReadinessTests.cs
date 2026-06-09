using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionPublishReadinessTests
{
    [TestMethod]
    public void Evaluate_first_publish_requires_title_description_and_icon_when_public()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            IsPublic = true,
        });

        Assert.IsFalse(result.Ready);
        Assert.AreEqual(3, result.Issues.Count);
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_TITLE"));
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_DESCRIPTION"));
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_ICON"));
    }

    [TestMethod]
    public void Evaluate_first_publish_accepts_metadata_from_action()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "生成随机字符串",
            ActionDescription = "生成指定长度和字符集的随机字符串",
            ActionIcon = "fa:Light_DiceD20",
            IsPublic = true,
            HasWebConnector = true,
            HasActionEditMgr = true,
        });

        Assert.IsTrue(result.Ready, result.Message);
        Assert.AreEqual(0, result.Issues.Count);
    }

    [TestMethod]
    public void Evaluate_update_requires_changelog()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModeUpdate,
        });

        Assert.IsFalse(result.Ready);
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_CHANGELOG"));
    }

    [TestMethod]
    public void Evaluate_private_publish_skips_icon_requirement()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            IsPublic = false,
            HasWebConnector = true,
            HasActionEditMgr = true,
        });

        Assert.IsTrue(result.Ready, result.Message);
    }

    [TestMethod]
    public void Evaluate_rejects_system_icon_for_public_share()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            ActionIcon = "fa:_system_Something",
            IsPublic = true,
            HasWebConnector = true,
            HasActionEditMgr = true,
        });

        Assert.IsFalse(result.Ready);
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_ICON"));
    }
}
