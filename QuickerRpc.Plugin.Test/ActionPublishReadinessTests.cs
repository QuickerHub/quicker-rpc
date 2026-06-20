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
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_TITLE"));
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_DESCRIPTION"));
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_ICON"));
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_DETAIL"));
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
            DetailHtml = "<p>Intro</p>",
        });

        Assert.IsTrue(result.Ready, result.Message);
        Assert.AreEqual(0, result.Issues.Count);
    }

    [TestMethod]
    public void Evaluate_public_publish_rejects_share_note()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            ActionIcon = "fa:Light_DiceD20",
            IsPublic = true,
            HasWebConnector = true,
            HasActionEditMgr = true,
            RequestNote = "Simple intro line",
        });

        Assert.IsFalse(result.Ready);
        Assert.IsTrue(result.Issues.Any(i => i.Code == "DEPRECATED_SHARE_NOTE"));
    }

    [TestMethod]
    public void Evaluate_public_publish_requires_intro_when_submit_review_enabled()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            ActionIcon = "fa:Light_DiceD20",
            IsPublic = true,
            HasWebConnector = true,
            HasActionEditMgr = true,
            SubmitReview = true,
        });

        Assert.IsFalse(result.Ready);
        Assert.IsTrue(result.Issues.Any(i => i.Code == "MISSING_DETAIL"));
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
    public void Evaluate_rejects_free_form_tags_not_in_allowed_list()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            IsPublic = false,
            Tags = "语音输入,文本处理",
            AllowedTags = new[] { "文本处理", "AI", "其他" },
        });

        Assert.IsFalse(result.Ready);
        var issue = result.Issues.Single(i => i.Code == "INVALID_TAGS");
        Assert.AreEqual("tags", issue.Field);
        StringAssert.Contains(issue.Message, "语音输入");
    }

    [TestMethod]
    public void Evaluate_normalizes_valid_tags_with_chinese_separator_and_casing()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            IsPublic = false,
            Tags = " 文本处理 ， ai ",
            AllowedTags = new[] { "文本处理", "AI", "其他" },
        });

        Assert.IsTrue(result.Ready, result.Message);
        Assert.AreEqual("文本处理,AI", result.Tags);
    }

    [TestMethod]
    public void Evaluate_passes_tags_through_when_allowed_list_unavailable()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            IsPublic = false,
            Tags = "anything,goes",
            AllowedTags = null,
        });

        Assert.IsTrue(result.Ready, result.Message);
        Assert.AreEqual("anything,goes", result.Tags);
    }

    [TestMethod]
    public void Evaluate_treats_empty_tags_as_absent()
    {
        var result = ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = ActionPublishReadiness.ModePublish,
            ActionTitle = "Test",
            ActionDescription = "Desc",
            IsPublic = false,
            Tags = " ，, ",
            AllowedTags = new[] { "其他" },
        });

        Assert.IsTrue(result.Ready, result.Message);
        Assert.IsNull(result.Tags);
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
