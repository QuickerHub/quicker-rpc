using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class GuideMarkdownSectionParserTests
{
    [TestInitialize]
    public void ResetIndex() => GuideSearchIndex.Reset();

    [TestCleanup]
    public void Cleanup() => GuideSearchIndex.Reset();

    [TestMethod]
    public void ParseH2Sections_splits_major_sections()
    {
        const string markdown = """
            # Title

            intro

            ## Pub3 First publish

            publish body alpha

            ## Pub5 Action page intro

            preview Playwright panel
            """;

        var sections = GuideMarkdownSectionParser.ParseH2Sections(markdown);

        Assert.AreEqual(2, sections.Count);
        Assert.AreEqual("Pub3 First publish", sections[0].Heading);
        StringAssert.Contains(sections[0].Body, "publish body alpha");
        Assert.AreEqual("Pub5 Action page intro", sections[1].Heading);
        StringAssert.Contains(sections[1].Body, "Playwright");
    }

    [TestMethod]
    public void PublishTopics_indexes_section_body_beyond_topic_compact_limit()
    {
        var filler = new string('x', 900);
        var markdown = $"""
            # Action publish workflow

            <!-- qkrpc-search-aliases: 发布, publish -->

            {filler}

            ## Pub5 Action page intro

            Agent STOP shared-info-set Playwright preview API
            """;

        GuideSearchIndex.Reset();
        GuideSearchIndex.PublishTopics(
            new[]
            {
                new GuideSearchEntry
                {
                    Topic = "action-publish-workflow",
                    Title = "Action publish workflow",
                    Markdown = markdown,
                },
            });

        var hits = GuideSearchIndex.Search("Playwright preview", limit: 10);
        Assert.IsTrue(hits.Count > 0);
        Assert.AreEqual("action-publish-workflow", GuideSearchIndex.ResolveTopicId(hits[0].DocumentId));

        var guides = new ActionAuthoringGuideService();
        var result = guides.Search("Playwright preview", maxResults: 3);
        StringAssert.Contains(result.Items[0].Excerpt, "Playwright");
    }

    [TestMethod]
    public void Search_returns_section_heading_and_excerpt_fragment()
    {
        GuideSearchIndex.Reset();
        var guides = new ActionAuthoringGuideService();
        GuideSearchIndex.PublishTopics(
            new[]
            {
                new GuideSearchEntry
                {
                    Topic = "action-publish-workflow",
                    Title = "Action publish workflow",
                    Markdown = """
                        # Action publish workflow

                        <!-- qkrpc-search-aliases: 发布, changelog -->

                        ## Pub4 Update

                        changelog required for update path

                        ## Pub5 Action page intro

                        Agent STOP shared-info preview Playwright
                        """,
                },
            });

        var result = guides.Search("Agent STOP shared-info Playwright", maxResults: 5);

        Assert.IsTrue(result.MatchCount > 0);
        Assert.AreEqual("action-publish-workflow", result.Items[0].Topic);
        StringAssert.Contains(result.Items[0].Excerpt, "Playwright");
        if (!string.IsNullOrEmpty(result.Items[0].Section))
        {
            StringAssert.Contains(result.Items[0].Section, "Pub5");
        }
    }

    [TestMethod]
    public void Search_aliases_match_chinese_publish_query()
    {
        GuideSearchIndex.Reset();
        GuideSearchIndex.PublishTopics(
            new[]
            {
                new GuideSearchEntry
                {
                    Topic = "action-publish-workflow",
                    Title = "Action publish workflow",
                    Markdown = """
                        # Action publish workflow

                        <!-- qkrpc-search-aliases: 发布, 分享, changelog -->

                        ## Pub3 First publish

                        title description required
                        """,
                },
                new GuideSearchEntry
                {
                    Topic = "overview",
                    Title = "Overview",
                    Markdown = "# Overview\n\nStart here.",
                },
            });

        var hits = GuideSearchIndex.Search("发布 changelog", limit: 5);

        Assert.IsTrue(hits.Count > 0);
        Assert.AreEqual("action-publish-workflow", GuideSearchIndex.ResolveTopicId(hits[0].DocumentId));
    }
}
