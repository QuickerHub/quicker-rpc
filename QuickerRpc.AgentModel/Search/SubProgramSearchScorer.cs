using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

public static class SubProgramSearchScorer
{
    public const string FieldId = "id";
    public const string FieldName = "name";
    public const string FieldCallId = "callId";
    public const string FieldDescription = "description";

    public static int ScoreDocument(SearchDocument document, string keyword) =>
        ScoreFields(
            keyword,
            document.Fields.TryGetValue(FieldId, out var id) ? id : null,
            document.Fields.TryGetValue(FieldName, out var name) ? name : null,
            document.Fields.TryGetValue(FieldCallId, out var callId) ? callId : null,
            document.Fields.TryGetValue(FieldDescription, out var description) ? description : null);

    public static int ScoreDocumentByKeyword(string keyword, SearchDocument document) =>
        ScoreDocument(document, keyword);

    public static int ScoreFields(
        string keyword,
        string? id,
        string? name,
        string? callId,
        string? description) =>
        TextMatchScorer.Score(
            keyword,
            new List<TextMatchScorer.FieldRule>
            {
                new TextMatchScorer.FieldRule { Value = id, ExactScore = 200 },
                new TextMatchScorer.FieldRule { Value = callId, ExactScore = 200, ContainsScore = 100 },
                new TextMatchScorer.FieldRule { Value = name, ExactScore = 150, ContainsScore = 100 },
                new TextMatchScorer.FieldRule { Value = description, ContainsScore = 60 },
            });
}
