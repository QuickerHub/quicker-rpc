using System;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Test;
[TestClass]
public sealed class AgentSearchHubTests
{
    [TestMethod]
    public void SubProgram_linear_search_ranks_exact_name_highest()
    {
        var hub = new AgentSearchHub();
        hub.Publish(
            SearchRegion.SubProgram,
            new[]
            {
                Doc("a1", "Alpha", callId: "Alpha", description: "first"),
                Doc("b2", "BetaTool", callId: "BetaTool", description: "beta"),
            },
            SearchRegionMode.LinearSubstring,
            linearScorer: SubProgramSearchScorer.ScoreDocument);

        var hits = hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.SubProgram },
                Query = "BetaTool",
                Limit = 5,
            });

        Assert.AreEqual(1, hits.Count);
        Assert.AreEqual("b2", hits[0].DocumentId);
        Assert.IsTrue(hits[0].Score >= 150);
    }

    [TestMethod]
    public void SubProgram_empty_query_lists_sorted_by_name()
    {
        var hub = new AgentSearchHub();
        hub.Publish(
            SearchRegion.SubProgram,
            new[]
            {
                Doc("z", "Zulu"),
                Doc("a", "Alpha"),
            },
            SearchRegionMode.LinearSubstring,
            linearScorer: SubProgramSearchScorer.ScoreDocument);

        var hits = hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.SubProgram },
                Query = null,
                Limit = 10,
            });

        Assert.AreEqual(2, hits.Count);
        Assert.AreEqual("a", hits[0].DocumentId);
        Assert.AreEqual("z", hits[1].DocumentId);
    }

    [TestMethod]
    public void Guide_token_index_matches_topic_keywords()
    {
        GuideSearchIndex.Reset();
        GuideSearchIndex.PublishTopics(
            new[]
            {
                new GuideSearchEntry
                {
                    Topic = "authoring-workflow",
                    Title = "Authoring Workflow",
                    Markdown = "# Authoring Workflow\n\nUse step-runner search before editing.",
                },
                new GuideSearchEntry
                {
                    Topic = "workspace-editing",
                    Title = "Workspace Editing",
                    Markdown = "# Workspace\n\nDisk layout for .quicker/",
                },
            });

        var hits = GuideSearchIndex.Search("step-runner search", limit: 5);
        Assert.IsTrue(hits.Count > 0);
        Assert.AreEqual("authoring-workflow", hits[0].DocumentId);
    }

    [TestMethod]
    public void ActionAuthoringGuideService_search_uses_hub_index()
    {
        GuideSearchIndex.Reset();
        var guides = new ActionAuthoringGuideService();
        var result = guides.Search("authoring-workflow", maxResults: 5);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.MatchCount > 0);
        StringAssert.Contains(result.Items[0].Topic, "authoring");
    }

    [TestMethod]
    public void Action_linear_search_normalizes_title_spacing()
    {
        var hub = new AgentSearchHub();
        hub.Publish(
            SearchRegion.Action,
            new[]
            {
                ActionDoc("a1", "剪贴板 n10", "clipboard helper"),
                ActionDoc("a2", "Unrelated", "other"),
            },
            SearchRegionMode.LinearSubstring,
            linearScorer: ActionSearchScorer.ScoreDocument);

        var hits = hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.Action },
                Query = "剪贴板n10",
                Limit = 5,
            });

        Assert.AreEqual(1, hits.Count);
        Assert.AreEqual("a1", hits[0].DocumentId);
    }

    [TestMethod]
    public void Action_document_filter_limits_scope()
    {
        var hub = new AgentSearchHub();
        hub.Publish(
            SearchRegion.Action,
            new[]
            {
                ActionDoc("a1", "Alpha", profileId: "p1"),
                ActionDoc("a2", "Alpha", profileId: "p2"),
            },
            SearchRegionMode.LinearSubstring,
            linearScorer: ActionSearchScorer.ScoreDocument);

        var hits = hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.Action },
                Query = "Alpha",
                Limit = 10,
                DocumentFilter = doc =>
                    doc.Fields.TryGetValue(ActionSearchFields.ProfileId, out var profileId)
                    && profileId == "p1",
            });

        Assert.AreEqual(1, hits.Count);
        Assert.AreEqual("a1", hits[0].DocumentId);
    }

    [TestMethod]
    public void Invalidate_clears_region_snapshot()
    {
        var hub = new AgentSearchHub();
        hub.Publish(
            SearchRegion.SubProgram,
            new[] { Doc("a", "Alpha") },
            SearchRegionMode.LinearSubstring,
            linearScorer: SubProgramSearchScorer.ScoreDocument);

        Assert.IsTrue(hub.IsPublished(SearchRegion.SubProgram));
        hub.Invalidate(SearchRegion.SubProgram);
        Assert.IsFalse(hub.IsPublished(SearchRegion.SubProgram));
    }

    private static SearchDocument Doc(
        string id,
        string name,
        string? callId = null,
        string? description = null) =>
        new SubProgramSearchEntry
        {
            Id = id,
            Name = name,
            CallIdentifier = callId ?? name,
            Description = description,
        }.ToDocument();

    private static SearchDocument ActionDoc(string id, string title, string? description = null, string? profileId = null) =>
        new SearchDocument
        {
            Id = id,
            Region = SearchRegion.Action,
            SortKey = title,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ActionSearchFields.Id] = id,
                [ActionSearchFields.Title] = title,
                [ActionSearchFields.Description] = description ?? string.Empty,
                [ActionSearchFields.ProfileName] = string.Empty,
                [ActionSearchFields.ExeFile] = string.Empty,
                [ActionSearchFields.ProfileId] = profileId ?? string.Empty,
            },
        };
}
