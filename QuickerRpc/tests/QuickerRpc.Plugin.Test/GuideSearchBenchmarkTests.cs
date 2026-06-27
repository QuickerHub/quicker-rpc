using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Strict regression for embedded authoring guide search (TokenIndex + legacy AND).
/// Cases use natural agent queries — not topic slug echo — and assert ranking, precision, and score gaps.
/// </summary>
[TestClass]
public sealed class GuideSearchBenchmarkTests
{
    [TestInitialize]
    public void ResetIndex() => GuideSearchIndex.Reset();

    [TestCleanup]
    public void Cleanup() => GuideSearchIndex.Reset();

    [TestMethod]
    public void And_query_excludes_document_missing_any_pattern()
    {
        Publish(
            Entry("full-hit", "Full", "# Full\n\nalpha beta gamma tokens here."),
            Entry("partial-hit", "Partial", "# Partial\n\nalpha only here."),
            Entry("decoy", "Decoy", "# Decoy\n\nunrelated text."));

        var hits = GuideSearchIndex.Search("alpha beta", limit: 10);
        var ids = hits.Select(h => h.DocumentId).ToList();

        CollectionAssert.AreEqual(new[] { "full-hit" }, ids);
    }

    [TestMethod]
    public void Topic_field_beats_body_only_match_by_score_gap()
    {
        Publish(
            Entry("patch-workflow", "Patch workflow", "# Patch\n\nIncremental saves."),
            Entry("expressions", "Expressions", "# Expressions\n\nMentions patch syntax in passing for patch files."));

        var hits = GuideSearchIndex.Search("patch", limit: 5);
        Assert.AreEqual(2, hits.Count);

        var top = hits[0];
        var runnerUp = hits[1];
        Assert.AreEqual("patch-workflow", top.DocumentId);
        Assert.AreEqual("expressions", runnerUp.DocumentId);
        Assert.IsTrue(top.Score >= 8, $"topic hit score={top.Score}");
        Assert.IsTrue(runnerUp.Score <= 8, $"body-only score={runnerUp.Score}");
        Assert.IsTrue(top.Score - runnerUp.Score >= 4, $"gap={top.Score - runnerUp.Score}");
    }

    [TestMethod]
    public void Multi_word_query_excludes_catalog_without_both_patterns()
    {
        Publish(
            Entry("step-runner-search", "Step-runner search", "# Step-runner search\n\nUse before get."),
            Entry("step-modules", "Step modules", "# Modules\n\nCatalog browse only."));

        var hits = GuideSearchIndex.Search("step-runner search", limit: 10);
        var ids = hits.Select(h => h.DocumentId).ToList();

        CollectionAssert.Contains(ids, "step-runner-search");
        CollectionAssert.DoesNotContain(ids, "step-modules");
        Assert.AreEqual("step-runner-search", ids[0]);
    }

    [TestMethod]
    public void Empty_query_lists_topics_sorted_by_id()
    {
        Publish(
            Entry("z-topic", "Zulu", "# Z"),
            Entry("a-topic", "Alpha", "# A"));

        var hits = GuideSearchIndex.Search(null, limit: 10);
        Assert.AreEqual(2, hits.Count);
        Assert.AreEqual("a-topic", hits[0].DocumentId);
        Assert.AreEqual("z-topic", hits[1].DocumentId);
    }

    [TestMethod]
    public void Unknown_keyword_returns_no_hits()
    {
        Publish(Entry("overview", "Overview", "# Overview\n\nStart here."));
        var hits = GuideSearchIndex.Search("zzzz-not-in-any-guide-topic", limit: 5);
        Assert.AreEqual(0, hits.Count);
    }

    [DataTestMethod]
    [DynamicData(nameof(StrictEmbeddedCases), DynamicDataSourceType.Method)]
    public void Embedded_strict_regression(GuideSearchStrictCase testCase)
    {
        var hits = SearchEmbeddedHits(testCase.Query, testCase.Limit);
        var rankedTopics = hits.Select(h => GuideSearchIndex.ResolveTopicId(h.DocumentId)).ToList();

        if (testCase.ExactMatchCount is int exact)
        {
            Assert.AreEqual(
                exact,
                hits.Count,
                FormatCaseFailure(testCase, hits, $"expected exactly {exact} hits"));
        }

        if (testCase.MinMatchCount is int minCount)
        {
            Assert.IsTrue(
                hits.Count >= minCount,
                FormatCaseFailure(testCase, hits, $"expected at least {minCount} hits"));
        }

        if (testCase.MaxMatchCount is int maxCount)
        {
            Assert.IsTrue(
                hits.Count <= maxCount,
                FormatCaseFailure(testCase, hits, $"expected at most {maxCount} hits"));
        }

        Assert.IsTrue(
            hits.Count > 0,
            FormatCaseFailure(testCase, hits, "expected at least one hit"));

        Assert.AreEqual(
            testCase.ExpectedTop,
            rankedTopics[0],
            FormatCaseFailure(testCase, hits, $"wrong top"));

        if (testCase.ForbiddenTop is { Length: > 0 })
        {
            foreach (var forbidden in testCase.ForbiddenTop)
            {
                Assert.AreNotEqual(
                    forbidden,
                    rankedTopics[0],
                    FormatCaseFailure(testCase, hits, $"forbidden top={forbidden}"));
            }
        }

        if (testCase.ForbiddenInTopN is { Length: > 0 })
        {
            var topSlice = rankedTopics.Take(testCase.TopN).ToList();
            foreach (var forbidden in testCase.ForbiddenInTopN)
            {
                CollectionAssert.DoesNotContain(
                    topSlice,
                    forbidden,
                    FormatCaseFailure(testCase, hits, $"forbidden in top {testCase.TopN}={forbidden}"));
            }
        }

        if (testCase.ForbiddenAnywhere is { Length: > 0 })
        {
            foreach (var forbidden in testCase.ForbiddenAnywhere)
            {
                CollectionAssert.DoesNotContain(
                    rankedTopics,
                    forbidden,
                    FormatCaseFailure(testCase, hits, $"forbidden anywhere={forbidden}"));
            }
        }

        if (testCase.RequiredInTopN is { Length: > 0 })
        {
            var topSlice = rankedTopics.Take(testCase.TopN).ToList();
            foreach (var required in testCase.RequiredInTopN)
            {
                CollectionAssert.Contains(
                    topSlice,
                    required,
                    FormatCaseFailure(testCase, hits, $"required in top {testCase.TopN}={required}"));
            }
        }

        if (testCase.MinTopScore is int minTopScore)
        {
            Assert.IsTrue(
                hits[0].Score >= minTopScore,
                FormatCaseFailure(testCase, hits, $"top score {hits[0].Score} < {minTopScore}"));
        }

        if (testCase.MinGapToSecond is int minGap && hits.Count >= 2)
        {
            var gap = hits[0].Score - hits[1].Score;
            Assert.IsTrue(
                gap >= minGap,
                FormatCaseFailure(testCase, hits, $"score gap {gap} < {minGap}"));
        }
    }

    public static IEnumerable<object[]> StrictEmbeddedCases()
    {
        yield return Case(
            "bind wire variables",
            expectedTop: "action-data-schema",
            minMatchCount: 1,
            maxMatchCount: 3,
            minTopScore: 8,
            minGapToSecond: 2);

        yield return Case(
            "form.json fields",
            expectedTop: "form-spec",
            minMatchCount: 1,
            maxMatchCount: 4,
            minTopScore: 8,
            minGapToSecond: 2);

        yield return Case(
            "patch incremental steps",
            expectedTop: "patch-workflow",
            exactMatchCount: 1,
            minTopScore: 8);

        yield return Case(
            "step-runner search",
            expectedTop: "step-runner-search",
            forbiddenTop: new[] { "overview", "patch-workflow", "implementation-fallback" },
            forbiddenInTopN: new[] { "step-modules", "subprogram-workflow" },
            topN: 2,
            minTopScore: 12,
            minGapToSecond: 2);

        yield return Case(
            "P5 step-runner get",
            expectedTop: "step-runner-get",
            forbiddenTop: new[] { "overview", "patch-workflow" },
            forbiddenInTopN: new[] { "authoring-workflow" },
            topN: 2,
            requiredInTopN: new[] { "step-runner-search" },
            minTopScore: 8,
            minGapToSecond: 1);

        yield return Case(
            "workspace edit disk",
            expectedTop: "workspace-editing",
            forbiddenTop: new[] { "patch-workflow", "overview" },
            forbiddenInTopN: new[] { "subprogram-workflow" },
            topN: 3,
            minTopScore: 8,
            minGapToSecond: 2);

        yield return Case(
            "fa icon metadata",
            expectedTop: "action-icons",
            forbiddenTop: new[] { "patch-workflow", "overview" },
            forbiddenInTopN: new[] { "common-operation-item" },
            topN: 2,
            minTopScore: 8,
            minGapToSecond: 2);

        yield return Case(
            "evalexpression fallback",
            expectedTop: "implementation-fallback",
            forbiddenTop: new[] { "overview", "step-runner-search" },
            requiredInTopN: new[] { "expressions" },
            topN: 3,
            minTopScore: 8,
            minGapToSecond: 1);

        yield return Case(
            "embedded subprogram disk",
            expectedTop: "action-embedded-subprograms",
            forbiddenTop: new[] { "overview" },
            requiredInTopN: new[] { "subprogram-workflow" },
            topN: 2,
            minTopScore: 8,
            minGapToSecond: 1);

        yield return Case(
            "global subprogram callIdentifier",
            expectedTop: "subprogram-workflow",
            forbiddenTop: new[] { "overview", "action-embedded-subprograms" },
            topN: 1,
            minTopScore: 8);

        yield return Case(
            "qkrpc step-runner get-ui forbidden",
            expectedTop: "step-runner-get",
            forbiddenTop: new[] { "overview" },
            forbiddenAnywhere: new[] { "quicker-ui" },
            minMatchCount: 1,
            maxMatchCount: 4,
            minTopScore: 4);

        yield return Case(
            "发布 changelog",
            expectedTop: "action-publish-workflow",
            forbiddenTop: new[] { "overview", "authoring-workflow" },
            topN: 2,
            minTopScore: 5);

        yield return Case(
            "Pub5 动作说明 preview",
            expectedTop: "action-publish-workflow",
            forbiddenTop: new[] { "overview" },
            minMatchCount: 1,
            minTopScore: 4);
    }

    private static object[] Case(
        string query,
        string expectedTop,
        string[]? forbiddenTop = null,
        string[]? forbiddenInTopN = null,
        string[]? forbiddenAnywhere = null,
        string[]? requiredInTopN = null,
        int topN = 3,
        int? exactMatchCount = null,
        int? minMatchCount = null,
        int? maxMatchCount = null,
        int? minTopScore = null,
        int? minGapToSecond = null,
        int limit = 12) =>
        new object[]
        {
            new GuideSearchStrictCase
            {
                Query = query,
                ExpectedTop = expectedTop,
                ForbiddenTop = forbiddenTop,
                ForbiddenInTopN = forbiddenInTopN,
                ForbiddenAnywhere = forbiddenAnywhere,
                RequiredInTopN = requiredInTopN,
                TopN = topN,
                ExactMatchCount = exactMatchCount,
                MinMatchCount = minMatchCount,
                MaxMatchCount = maxMatchCount,
                MinTopScore = minTopScore,
                MinGapToSecond = minGapToSecond,
                Limit = limit,
            },
        };

    private static IReadOnlyList<SearchHit> SearchEmbeddedHits(string query, int limit)
    {
        GuideSearchIndex.Reset();
        var guides = new ActionAuthoringGuideService();
        _ = guides.Search(query, maxResults: 1);
        var searchLimit = Math.Min(50, Math.Max(limit * 4, limit));
        return GuideSearchIndex.Search(query, limit: searchLimit)
            .GroupBy(h => GuideSearchIndex.ResolveTopicId(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(h => h.Score).First())
            .OrderByDescending(h => h.Score)
            .ThenBy(h => GuideSearchIndex.ResolveTopicId(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
    }

    private static void Publish(params GuideSearchEntry[] entries) =>
        GuideSearchIndex.PublishTopics(entries);

    private static GuideSearchEntry Entry(string topic, string title, string markdown) =>
        new()
        {
            Topic = topic,
            Title = title,
            Markdown = markdown,
        };

    private static string FormatCaseFailure(
        GuideSearchStrictCase testCase,
        IReadOnlyList<SearchHit> hits,
        string reason)
    {
        var ranked = string.Join(
            " | ",
            hits.Select((hit, index) =>
                $"{index + 1}:{GuideSearchIndex.ResolveTopicId(hit.DocumentId)}#{hit.DocumentId}({hit.Score})"));
        return $"query={testCase.Query}; {reason}; ranked=[{ranked}]";
    }

    public sealed class GuideSearchStrictCase
    {
        public string Query { get; init; } = string.Empty;

        public string ExpectedTop { get; init; } = string.Empty;

        public string[]? ForbiddenTop { get; init; }

        public string[]? ForbiddenInTopN { get; init; }

        public string[]? ForbiddenAnywhere { get; init; }

        public string[]? RequiredInTopN { get; init; }

        public int TopN { get; init; } = 3;

        public int Limit { get; init; } = 12;

        public int? ExactMatchCount { get; init; }

        public int? MinMatchCount { get; init; }

        public int? MaxMatchCount { get; init; }

        public int? MinTopScore { get; init; }

        public int? MinGapToSecond { get; init; }
    }
}
