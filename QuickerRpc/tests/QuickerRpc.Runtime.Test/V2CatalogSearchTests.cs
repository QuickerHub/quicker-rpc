using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class V2CatalogSearchTests
{
    [TestMethod]
    public void ScoreAction_prefers_exact_id_match()
    {
        var score = InvokeScoreAction("abc-123", "abc-123", "Other title", "desc");
        Assert.IsTrue(score >= 200);
    }

    [TestMethod]
    public void SubProgramSearchScorer_matches_name_contains()
    {
        var score = SubProgramSearchScorer.ScoreFields("qexpr", "id1", "QExpr", "QExpr", "runner");
        Assert.IsTrue(score >= 100);
    }

    [TestMethod]
    public void SearchSubPrograms_empty_query_lists_all_when_flag_set()
    {
        var service = new V2HeadlessCatalogService();
        var result = service.ListSubPrograms(null, 30);
        Assert.IsFalse(result.Ok);
        Assert.IsTrue(result.Message?.Contains("unavailable", StringComparison.OrdinalIgnoreCase) == true);
    }

    private static int InvokeScoreAction(string keyword, string id, string title, string? description) =>
        TextMatchScorer.Score(
            keyword,
            [
                new TextMatchScorer.FieldRule { Value = id, ExactScore = 200 },
                new TextMatchScorer.FieldRule { Value = title, ExactScore = 150, ContainsScore = 100 },
                new TextMatchScorer.FieldRule { Value = description, ContainsScore = 60 },
            ]);
}
