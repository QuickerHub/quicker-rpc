using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Delegates action fuzzy scoring to <see cref="ActionSearchFuzzyMatch"/>.</summary>
internal static class ActionSearchScorer
{
    public static int ScoreDocument(SearchDocument document, string keyword)
    {
        document.Fields.TryGetValue(ActionSearchFields.Id, out var id);
        document.Fields.TryGetValue(ActionSearchFields.Title, out var title);
        document.Fields.TryGetValue(ActionSearchFields.Description, out var description);
        document.Fields.TryGetValue(ActionSearchFields.ProfileName, out var profileName);
        document.Fields.TryGetValue(ActionSearchFields.ExeFile, out var exeFile);

        return ActionSearchFuzzyMatch.ComputeScore(
            keyword,
            id,
            title ?? string.Empty,
            description,
            profileName,
            exeFile);
    }
}
